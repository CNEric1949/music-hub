import { qrc, utils } from 'smart-lyric';
import { httpFetch } from '../../../utils/request.js';
import {
  alignTimedLyric,
  emptyLyric,
  hasAnyLyric,
  lyricFailure,
  lyricToLxLrc,
  lyricToPlainLrc,
  mergeLyricInfo,
  msFormat
} from './common.js';

const successCode = 0;

export const getTxLyric = async songInfo => {
  const failures = [];
  let primary = null;
  try {
    primary = await getSmartLyric(songInfo);
  } catch (error) {
    failures.push(lyricFailure('smart-lyric', error));
  }

  let fallback = null;
  if (!primary?.tlyric || !primary?.rlyric || !primary?.lxlyric || !primary?.lyric) {
    try {
      fallback = await getFallbackLyric(songInfo);
    } catch (error) {
      failures.push(lyricFailure('fallback', error));
    }
  }

  const info = mergeLyricInfo(primary, fallback);
  if (!hasAnyLyric(info)) throw new Error(failures[0]?.message || 'QQ lyric not found');
  return { ...info, source: 'tx', raw: { provider: primary ? 'smart-lyric' : 'fallback', failures } };
};

const getSmartLyric = async songInfo => {
  const songID = await getSongId(songInfo);
  const result = await utils.downloadQQMusicLyric({
    songID,
    albumName: songInfo.albumName,
    songName: songInfo.name,
    singerName: songInfo.singer,
    qrc: true
  });
  if (!result?.karaok && !result?.regular) throw new Error('smart-lyric returned empty QQ lyric');
  if (result.karaok) {
    const parsed = qrc.parse(result.karaok);
    return {
      lyric: lyricToPlainLrc(parsed),
      tlyric: '',
      rlyric: '',
      lxlyric: lyricToLxLrc(parsed)
    };
  }
  return { lyric: result.regular || '', tlyric: '', rlyric: '', lxlyric: '' };
};

const getSongId = async songInfo => {
  if (songInfo.songId) return songInfo.songId;
  const response = await httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'post',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)' },
    body: {
      comm: { ct: '19', cv: '1859', uin: '0' },
      req: {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail_yqq',
        param: { song_type: 0, song_mid: songInfo.songmid }
      }
    }
  });
  const id = response.body?.req?.data?.track_info?.id;
  if (!id) throw new Error('QQ song id not found');
  return id;
};

const getFallbackLyric = async songInfo => {
  const songID = await getSongId(songInfo);
  const response = await httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'post',
    headers: {
      referer: 'https://y.qq.com',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
    },
    body: {
      comm: { ct: '19', cv: '1859', uin: '0' },
      req: {
        method: 'GetPlayLyricInfo',
        module: 'music.musichallSong.PlayLyricInfo',
        param: {
          format: 'json',
          crypt: 1,
          ct: 19,
          cv: 1873,
          interval: 0,
          lrc_t: 0,
          qrc: 1,
          qrc_t: 0,
          roma: 1,
          roma_t: 0,
          songID,
          trans: 1,
          trans_t: 0,
          type: -1
        }
      }
    }
  });
  if (response.body?.code !== successCode || response.body?.req?.code !== successCode) {
    throw new Error('QQ lyric API returned non-zero code');
  }
  const data = response.body.req.data || {};
  return parseTxLyric(
    decryptHexQrc(data.lyric),
    decryptHexQrc(data.trans),
    decryptHexQrc(data.roma)
  );
};

const decryptHexQrc = value => {
  if (!value) return '';
  return qrc.decrypt(Buffer.from(value, 'hex')) || '';
};

const parseTxLyric = (lrc, tlrc, rlrc) => {
  const info = emptyLyric('tx');
  if (lrc) {
    const parsed = parseQrcOrLineLyric(removeTag(lrc));
    info.lyric = parsed.lyric;
    info.lxlyric = parsed.lxlyric;
  }
  if (rlrc) info.rlyric = alignTimedLyric(parseQrcOrLineLyric(removeTag(rlrc)).lyric, info.lyric);
  if (tlrc) info.tlyric = alignTimedLyric(parseQrcOrLineLyric(tlrc).lyric, info.lyric);
  return info;
};

const parseQrcOrLineLyric = text => {
  if (!text) return { lyric: '', lxlyric: '' };
  if (text.trim().startsWith('<?xml')) {
    const parsed = qrc.parse(text);
    return { lyric: lyricToPlainLrc(parsed), lxlyric: lyricToLxLrc(parsed) };
  }
  return parseLineLyric(text);
};

const parseLineLyric = text => {
  const lrcLines = [];
  const lxLines = [];
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    const match = /^\[(\d+),\d+\]/.exec(line);
    if (!match) {
      if (/^\[([\d:.]+)\]/.test(line) || line.startsWith('[offset')) lrcLines.push(line);
      continue;
    }
    const start = Number(match[1]);
    const words = line.replace(/^\[(\d+),\d+\]/, '');
    lrcLines.push(`${msFormat(start)}${words.replace(/\(\d+,\d+\)/g, '')}`);
    const times = words.match(/\(\d+,\d+\)/g);
    if (!times) continue;
    const wordArr = words.split(/\(\d+,\d+\)/);
    const lxWords = times.map((time, index) => {
      const wordTime = /\((\d+),(\d+)\)/.exec(time);
      return `<${Math.max(Number(wordTime[1]) - start, 0)},${wordTime[2]}>${wordArr[index] || ''}`;
    }).join('');
    lxLines.push(`${msFormat(start)}${lxWords}`);
  }
  return { lyric: lrcLines.join('\n'), lxlyric: lxLines.join('\n') };
};

const removeTag = value => String(value || '').replace(/^[\S\s]*?LyricContent="/, '').replace(/"\/>[\S\s]*?$/, '');
