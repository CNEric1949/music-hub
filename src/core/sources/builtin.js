import crypto from 'node:crypto';
import { AppError, ERROR_CODES } from '../../shared/errors.js';
import { normalizeKeyword } from '../../shared/text.js';
import { httpFetch } from '../../utils/request.js';
import { getBuiltinLyric } from './lyrics/index.js';

const defaultQualities = ['128k', '320k', 'flac', 'flac24bit'];

const builtinSourceDefs = [
  { id: 'kw', name: '酷我音乐', capabilities: ['search', 'lyric', 'cover', 'album'] },
  { id: 'kg', name: '酷狗音乐', capabilities: ['search', 'lyric', 'cover', 'album', 'singer'] },
  { id: 'tx', name: 'QQ音乐', capabilities: ['search', 'lyric', 'cover', 'singer'] },
  { id: 'wy', name: '网易云音乐', capabilities: ['search', 'lyric', 'cover', 'singer', 'detail'] },
  { id: 'mg', name: '咪咕音乐', capabilities: ['search', 'lyric', 'cover', 'album'] }
];

const unsupported = capability => {
  throw new AppError(
    ERROR_CODES.SOURCE_CAPABILITY_UNSUPPORTED,
    `Source does not support capability: ${capability}`,
    { capability },
    422
  );
};

const sizeFormat = size => {
  const num = Number(size || 0);
  if (!num) return null;
  if (num < 1024) return `${num}B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(2)}KB`;
  return `${(num / 1024 / 1024).toFixed(2)}MB`;
};

const formatPlayTime = seconds => {
  const num = Number(seconds || 0);
  const min = Math.floor(num / 60);
  const sec = Math.floor(num % 60);
  return `${min}:${String(sec).padStart(2, '0')}`;
};

const decodeName = value => {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return String(value);
  }
};

const singerNames = (singers, key = 'name') => Array.isArray(singers)
  ? singers.map(item => item?.[key] || item?.name || '').filter(Boolean).join('、')
  : '';

const addType = (types, type, size, extra = {}) => {
  if (size === 0 || size === '0') return;
  types.push({ type, size: sizeFormat(size) || size || null, ...extra });
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const qqSearchRetryDelay = (attempt, random = Math.random) => {
  const base = 5000 * (2 ** Math.max(attempt - 1, 0));
  const jitter = Math.floor(random() * 1000);
  return Math.min(base + jitter, 30_000);
};

const withRetry = async (operation, { retries = 3, delay = qqSearchRetryDelay, wait = sleep, shouldRetry = () => true } = {}) => {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) break;
      await wait(delay(attempt + 1, Math.random));
    }
  }
  throw lastError;
};

const searchKw = async ({ keyword, page, limit }) => {
  const url = `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`;
  const result = (await httpFetch(url)).body;
  const list = (result?.abslist || []).map(info => {
    const types = [];
    for (const item of String(info.N_MINFO || '').split(';')) {
      const match = item.match(/level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/);
      if (!match) continue;
      if (match[2] === '4000') types.push({ type: 'flac24bit', size: match[4] });
      else if (match[2] === '2000') types.push({ type: 'flac', size: match[4] });
      else if (match[2] === '320') types.push({ type: '320k', size: match[4] });
      else if (match[2] === '128') types.push({ type: '128k', size: match[4] });
    }
    return {
      source: 'kw',
      songmid: String(info.MUSICRID || '').replace('MUSIC_', ''),
      name: decodeName(info.SONGNAME),
      singer: decodeName(info.ARTIST).replace(/,/g, '、'),
      albumName: decodeName(info.ALBUM || ''),
      albumId: decodeName(info.ALBUMID || ''),
      interval: formatPlayTime(info.DURATION),
      img: '',
      types: types.reverse(),
      meta: { raw: info }
    };
  });
  const total = Number(result?.TOTAL || list.length || 0);
  return { list, allPage: Math.ceil(total / limit), total, limit, source: 'kw' };
};

const searchKg = async ({ keyword, page, limit }) => {
  const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&userid=0&clientver=&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`;
  const result = (await httpFetch(url)).body;
  const rows = result?.data?.lists || [];
  const seen = new Set();
  const list = [];
  const push = data => {
    const key = `${data.Audioid}-${data.FileHash}`;
    if (seen.has(key)) return;
    seen.add(key);
    const types = [];
    addType(types, '128k', data.FileSize, { hash: data.FileHash });
    addType(types, '320k', data.HQFileSize, { hash: data.HQFileHash });
    addType(types, 'flac', data.SQFileSize, { hash: data.SQFileHash });
    addType(types, 'flac24bit', data.ResFileSize, { hash: data.ResFileHash });
    list.push({
      source: 'kg',
      songmid: data.Audioid,
      name: decodeName(data.SongName),
      singer: singerNames(data.Singers),
      albumName: decodeName(data.AlbumName),
      albumId: data.AlbumID,
      interval: formatPlayTime(data.Duration),
      img: '',
      hash: data.FileHash,
      types,
      meta: { raw: data }
    });
  };
  for (const item of rows) {
    push(item);
    for (const child of item.Grp || []) push(child);
  }
  const total = Number(result?.data?.total || list.length || 0);
  return { list, allPage: Math.ceil(total / limit), total, limit, source: 'kg' };
};

const searchTxOnce = async ({ keyword, page, limit }) => {
  const response = await httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'post',
    headers: {
      'User-Agent': 'QQMusic 14090508(android 12)',
      'Content-Type': 'application/json'
    },
    body: {
      comm: {
        ct: '11',
        cv: '14090508',
        v: '14090508',
        tmeAppID: 'qqmusic',
        phonetype: 'EBG-AN10',
        deviceScore: '553.47',
        devicelevel: '50',
        newdevicelevel: '20',
        rom: 'HuaWei/EMOTION/EmotionUI_14.2.0',
        os_ver: '12',
        OpenUDID: '0',
        OpenUDID2: '0',
        QIMEI36: '0',
        udid: '0',
        chid: '0',
        aid: '0',
        oaid: '0',
        taid: '0',
        tid: '0',
        wid: '0',
        uid: '0',
        sid: '0',
        modeSwitch: '6',
        teenMode: '0',
        ui_mode: '2',
        nettype: '1020',
        v4ip: ''
      },
      req: {
        module: 'music.search.SearchCgiService',
        method: 'DoSearchForQQMusicMobile',
        param: {
          search_type: 0,
          searchid: Math.random().toString().slice(2),
          query: keyword,
          page_num: page,
          num_per_page: limit,
          highlight: 0,
          nqc_flag: 0,
          multi_zhida: 0,
          cat: 2,
          grp: 1,
          sin: 0,
          sem: 0
        }
      }
    }
  });
  if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(`QQ search HTTP ${response.statusCode}`);
  if (response.body?.code !== 0 || response.body?.req?.code !== 0) {
    throw new Error(`QQ search failed: ${response.body?.req?.code ?? response.body?.code ?? 'unknown'}`);
  }
  const data = response.body?.req?.data || {};
  const rows = data.body?.item_song || [];
  const list = rows.map(item => {
    const file = item.file || {};
    const types = [];
    addType(types, '128k', file.size_128mp3);
    addType(types, '320k', file.size_320mp3);
    addType(types, 'flac', file.size_flac);
    addType(types, 'flac24bit', file.size_hires);
    const albumMid = item.album?.mid || '';
    return {
      source: 'tx',
      songmid: item.mid,
      songId: item.id,
      strMediaMid: file.media_mid,
      name: `${item.name || ''}${item.title_extra || ''}`,
      singer: singerNames(item.singer),
      albumName: item.album?.name || '',
      albumId: albumMid,
      interval: formatPlayTime(item.interval),
      img: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumMid}.jpg` : '',
      types,
      meta: { raw: item }
    };
  });
  const total = Number(data.meta?.estimate_sum || list.length || 0);
  return { list, allPage: Math.ceil(total / limit), total, limit, source: 'tx' };
};

export const searchTx = async options => withRetry(
  () => searchTxOnce(options),
  { retries: 3 }
);

const wyEapi = (url, object) => {
  const text = JSON.stringify(object);
  const message = `nobody${url}use${text}md5forencrypt`;
  const digest = crypto.createHash('md5').update(message).digest('hex');
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8'), '');
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('hex').toUpperCase();
};

const searchWy = async ({ keyword, page, limit }) => {
  const params = wyEapi('/api/cloudsearch/pc', {
    s: keyword,
    type: 1,
    limit,
    total: page === 1,
    offset: limit * (page - 1)
  });
  const result = (await httpFetch('http://interface.music.163.com/eapi/batch', {
    method: 'post',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Origin: 'https://music.163.com',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `params=${params}`
  })).body;
  const rows = result?.result?.songs || [];
  const list = rows.map(item => {
    const privilege = item.privilege || {};
    const types = [];
    if (privilege.maxBrLevel === 'hires') addType(types, 'flac24bit', item.hr?.size);
    if (privilege.maxbr >= 999000) addType(types, 'flac', item.sq?.size);
    if (privilege.maxbr >= 320000) addType(types, '320k', item.h?.size);
    if (privilege.maxbr >= 128000) addType(types, '128k', item.l?.size);
    return {
      source: 'wy',
      songmid: item.id,
      name: item.name,
      singer: singerNames(item.artists || item.ar),
      albumName: item.album?.name || item.al?.name || '',
      albumId: item.album?.id || item.al?.id || '',
      interval: formatPlayTime((item.duration || item.dt || 0) / 1000),
      img: item.album?.picUrl || item.al?.picUrl || '',
      types: types.reverse(),
      meta: { raw: item }
    };
  });
  const total = Number(result?.result?.songCount || list.length || 0);
  return { list, allPage: Math.ceil(total / limit), total, limit, source: 'wy' };
};

const mgSign = (time, keyword) => {
  const deviceId = '963B7AA0D21511ED807EE5846EC87D20';
  const text = `${keyword}6cdc72a439cef99a3418d2a78aa28c73yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${time}`;
  return { deviceId, sign: crypto.createHash('md5').update(text).digest('hex') };
};

const searchMg = async ({ keyword, page, limit }) => {
  const time = Date.now().toString();
  const { deviceId, sign } = mgSign(time, keyword);
  const url = `https://jadeite.migu.cn/music_search/v3/search/searchAll?isCorrect=0&isCopyright=1&searchSwitch=%7B%22song%22%3A1%2C%22album%22%3A0%2C%22singer%22%3A0%2C%22tagSong%22%3A1%2C%22mvSong%22%3A0%2C%22bestShow%22%3A1%2C%22songlist%22%3A0%2C%22lyricSong%22%3A0%7D&pageSize=${limit}&text=${encodeURIComponent(keyword)}&pageNo=${page}&sort=0&sid=USS`;
  const result = (await httpFetch(url, {
    headers: {
      uiVersion: 'A_music_3.6.1',
      deviceId,
      timestamp: time,
      sign,
      channel: '0146921',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 11)'
    }
  })).body;
  const rows = result?.songResultData?.resultList || [];
  const list = [];
  const seen = new Set();
  for (const group of rows) {
    for (const item of group) {
      if (!item.songId || seen.has(item.copyrightId)) continue;
      seen.add(item.copyrightId);
      const types = [];
      for (const format of item.audioFormats || []) {
        if (format.formatType === 'PQ') addType(types, '128k', format.asize ?? format.isize);
        else if (format.formatType === 'HQ') addType(types, '320k', format.asize ?? format.isize);
        else if (format.formatType === 'SQ') addType(types, 'flac', format.asize ?? format.isize);
        else if (format.formatType === 'ZQ24') addType(types, 'flac24bit', format.asize ?? format.isize);
      }
      let img = item.img3 || item.img2 || item.img1 || '';
      if (img && !/^https?:/.test(img)) img = `http://d.musicapp.migu.cn${img}`;
      list.push({
        source: 'mg',
        songmid: item.songId,
        copyrightId: item.copyrightId,
        name: item.name,
        singer: singerNames(item.singerList),
        albumName: item.album || '',
        albumId: item.albumId || '',
        interval: formatPlayTime(item.duration),
        img,
        types,
        meta: { raw: item }
      });
    }
  }
  const total = Number(result?.songResultData?.totalCount || list.length || 0);
  return { list, allPage: Math.ceil(total / limit), total, limit, source: 'mg' };
};

const searchers = {
  kw: searchKw,
  kg: searchKg,
  tx: searchTx,
  wy: searchWy,
  mg: searchMg
};

const createBuiltinSource = definition => ({
  id: definition.id,
  name: definition.name,
  type: 'builtin',
  enabled: true,
  initialized: true,
  version: 'builtin',
  supportedQualities: defaultQualities,
  capabilities: definition.capabilities,
  async search({ keyword, page = 1, limit = 20 }) {
    const query = normalizeKeyword(keyword);
    if (!query) return { list: [], allPage: 0, total: 0, limit, source: definition.id };
    return searchers[definition.id]({ keyword: query, page: Number(page), limit: Number(limit) });
  },
  async getLyric(songInfo) {
    if (!definition.capabilities.includes('lyric')) unsupported('lyric');
    return getBuiltinLyric(definition.id, songInfo);
  },
  async getCover(songInfo) {
    if (!definition.capabilities.includes('cover')) unsupported('cover');
    return songInfo?.img || '';
  },
  async getAlbumDetail(payload) {
    if (!definition.capabilities.includes('album')) unsupported('album');
    return { source: definition.id, albumId: payload.albumId || payload.songInfo?.albumId || '', name: payload.albumName || payload.songInfo?.albumName || '', songs: [] };
  },
  async getSingerDetail(payload) {
    if (!definition.capabilities.includes('singer')) unsupported('singer');
    return { source: definition.id, singerId: payload.singerId || '', name: payload.singer || payload.songInfo?.singer || '', songs: [] };
  },
  async getMusicDetail(payload) {
    if (!definition.capabilities.includes('detail')) unsupported('detail');
    return { source: definition.id, songInfo: payload.songInfo || payload };
  },
  async getMusicUrl() {
    unsupported('url');
  }
});

export const createBuiltinSources = () => builtinSourceDefs.map(createBuiltinSource);
