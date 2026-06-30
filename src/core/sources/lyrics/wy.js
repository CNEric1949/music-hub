import crypto from 'node:crypto';
import { nrc, utils } from 'smart-lyric';
import { httpFetch } from '../../../utils/request.js';
import {
  alignTimedLyric,
  emptyLyric,
  hasAnyLyric,
  lyricFailure,
  lyricToLxLrc,
  lyricToPlainLrc,
  md5,
  mergeLyricInfo,
  msFormat
} from './common.js';

export const getWyLyric = async songInfo => {
  const failures = [];
  let primary = null;
  try {
    primary = await getSmartLyric(songInfo);
  } catch (error) {
    failures.push(lyricFailure('smart-lyric', error));
  }

  let fallback = null;
  if (!primary?.lyric || !primary?.tlyric || !primary?.rlyric || !primary?.lxlyric) {
    try {
      fallback = await getFallbackLyric(songInfo);
    } catch (error) {
      failures.push(lyricFailure('fallback', error));
    }
  }

  const info = mergeLyricInfo(primary, fallback);
  if (!hasAnyLyric(info)) throw new Error(failures[0]?.message || 'Netease lyric not found');
  return { ...info, source: 'wy', raw: { provider: primary ? 'smart-lyric' : 'fallback', failures } };
};

const getSmartLyric = async songInfo => {
  const result = await utils.downloadNeteasyLyric({ musicID: String(songInfo.songmid) });
  if (result.karaok) {
    const parsed = nrc.parse(result.karaok);
    return {
      lyric: lyricToPlainLrc(parsed),
      tlyric: '',
      rlyric: '',
      lxlyric: lyricToLxLrc(parsed)
    };
  }
  if (result.regular) return { lyric: result.regular, tlyric: '', rlyric: '', lxlyric: '' };
  throw new Error('smart-lyric returned empty Netease lyric');
};

const getFallbackLyric = async songInfo => {
  const url = '/api/song/lyric/v1';
  const response = await httpFetch('https://interface3.music.163.com/eapi/song/lyric/v1', {
    method: 'post',
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
      Origin: 'https://music.163.com',
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `params=${wyEapi(url, {
      id: songInfo.songmid,
      cp: false,
      tv: 0,
      lv: 0,
      rv: 0,
      kv: 0,
      yv: 0,
      ytv: 0,
      yrv: 0
    })}`
  });
  if (response.body?.code !== 200) throw new Error('Netease lyric API returned non-200 code');
  const fixed = fixTimeLabel(response.body.lrc?.lyric, response.body.tlyric?.lyric, response.body.romalrc?.lyric);
  const info = parseWyLyric(
    response.body.yrc?.lyric,
    response.body.ytlrc?.lyric,
    response.body.yromalrc?.lyric,
    fixed.lrc,
    fixed.tlrc,
    fixed.romalrc
  );
  if (!info.lyric) {
    info.lyric = fixed.lrc || '';
    info.tlyric = fixed.tlrc || '';
    info.rlyric = fixed.romalrc || '';
  }
  return info;
};

const wyEapi = (url, object) => {
  const text = JSON.stringify(object);
  const digest = md5(`nobody${url}use${text}md5forencrypt`);
  const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;
  const cipher = crypto.createCipheriv('aes-128-ecb', Buffer.from('e82ckenh8dichen8'), '');
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('hex').toUpperCase();
};

const fixTimeLabel = (lrcText, tlrc, romalrc) => {
  let lrc = lrcText;
  if (lrc) {
    const nextLrc = lrc.replace(/\[(\d{2}:\d{2}):(\d{2})]/g, '[$1.$2]');
    const nextTlrc = tlrc?.replace(/\[(\d{2}:\d{2}):(\d{2})]/g, '[$1.$2]') ?? tlrc;
    if (nextLrc !== lrc || nextTlrc !== tlrc) {
      lrc = nextLrc;
      tlrc = nextTlrc;
      if (romalrc) romalrc = romalrc.replace(/\[(\d{2}:\d{2}):(\d{2,3})]/g, '[$1.$2]').replace(/\[(\d{2}:\d{2}\.\d{2})0]/g, '[$1]');
    }
  }
  return { lrc, tlrc, romalrc };
};

const parseWyLyric = (ylrc, ytlrc, yrlrc, lrcText, tlrc, rlrc) => {
  const info = emptyLyric('wy');
  if (ylrc) {
    const lines = parseHeaderInfo(ylrc);
    if (lines?.length) {
      const parsed = parseYrc(lines);
      info.lyric = parsed.lyric;
      info.lxlyric = parsed.lxlyric;
      if (ytlrc) info.tlyric = alignTimedLyric((parseHeaderInfo(ytlrc) || []).join('\n'), info.lyric);
      if (yrlrc) info.rlyric = alignTimedLyric((parseHeaderInfo(yrlrc) || []).join('\n'), info.lyric);
      return info;
    }
  }
  if (lrcText) info.lyric = (parseHeaderInfo(lrcText) || []).join('\n');
  if (tlrc) info.tlyric = (parseHeaderInfo(tlrc) || []).join('\n');
  if (rlrc) info.rlyric = (parseHeaderInfo(rlrc) || []).join('\n');
  return info;
};

const parseHeaderInfo = text => {
  const content = String(text || '').trim().replace(/\r/g, '');
  if (!content) return null;
  return content.split('\n').map(line => {
    if (!/^{"/.test(line)) return line;
    try {
      const info = JSON.parse(line);
      const words = (info.c || []).map(item => item.tx).join('');
      return Number.isFinite(info.t) ? `${msFormat(info.t)}${words}` : words;
    } catch {
      return '';
    }
  });
};

const parseYrc = lines => {
  const lrcLines = [];
  const lxLines = [];
  for (const raw of lines) {
    const line = raw.trim();
    const match = /^\[(\d+),\d+\]/.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const words = line.replace(/^\[(\d+),\d+\]/, '');
    lrcLines.push(`${msFormat(start)}${words.replace(/(\(\d+,\d+,\d+\))/g, '')}`);
    const times = words.match(/(\(\d+,\d+,\d+\))/g);
    if (!times) continue;
    const wordArr = words.split(/\(\d+,\d+,\d+\)/);
    wordArr.shift();
    const lxWords = times.map((time, index) => {
      const wordTime = /\((\d+),(\d+),\d+\)/.exec(time);
      return `<${Math.max(Number(wordTime[1]) - start, 0)},${wordTime[2]}>${wordArr[index] || ''}`;
    }).join('');
    lxLines.push(`${msFormat(start)}${lxWords}`);
  }
  return { lyric: lrcLines.join('\n'), lxlyric: lxLines.join('\n') };
};
