import { lrc, lrcx, utils } from 'smart-lyric';
import iconv from 'iconv-lite';
import { httpFetch } from '../../../utils/request.js';
import {
  emptyLyric,
  hasAnyLyric,
  inflateBuffer,
  lyricFailure,
  lyricToLxLrc,
  lyricToPlainLrc,
  mergeLyricInfo,
  stripWordTimes
} from './common.js';

const key = Buffer.from('yeelion');

export const getKwLyric = async songInfo => {
  const failures = [];
  let primary = null;
  try {
    primary = await getSmartLyric(songInfo);
  } catch (error) {
    failures.push(lyricFailure('smart-lyric', error));
  }

  let fallback = null;
  if (!primary?.lyric || !primary?.tlyric || !primary?.lxlyric) {
    try {
      fallback = await getFallbackLyric(songInfo);
    } catch (error) {
      failures.push(lyricFailure('fallback', error));
    }
  }

  const info = mergeLyricInfo(primary, fallback);
  if (!hasAnyLyric(info)) throw new Error(failures[0]?.message || 'Kuwo lyric not found');
  return { ...info, source: 'kw', raw: { provider: primary ? 'smart-lyric' : 'fallback', failures } };
};

const getSmartLyric = async songInfo => {
  const result = await utils.downloadKuwoLyric({ musicID: songInfo.songmid, lrcx: true });
  if (result.karaok) {
    const parsed = lrcx.parse(result.karaok);
    return {
      lyric: lyricToPlainLrc(parsed),
      tlyric: '',
      rlyric: '',
      lxlyric: lyricToLxLrc(parsed)
    };
  }
  if (result.regular) {
    return splitRegularLyric(result.regular);
  }
  throw new Error('smart-lyric returned empty Kuwo lyric');
};

const getFallbackLyric = async songInfo => {
  const response = await httpFetch(`http://newlyric.kuwo.cn/newlyric.lrc?${buildParams(songInfo.songmid, true)}`, {
    responseType: 'buffer'
  });
  const decoded = await decodeLyric(response.raw || response.body, true);
  if (!decoded) throw new Error('Kuwo lyric decode returned empty text');
  return splitRegularLyric(decoded);
};

const splitRegularLyric = text => {
  const info = emptyLyric('kw');
  const parsed = tryParseLrc(text);
  if (parsed) info.lyric = lyricToPlainLrc(parsed);

  const tags = [];
  const lyricLines = [];
  const translatedLines = [];
  const timeExp = /^\[(\d{1,2}:\d{1,2}\.\d{1,3})\](.*)$/;
  for (const raw of String(text || '').split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (/^\[(ti|ar|al|by|offset):/.test(line)) tags.push(line);
    else if (timeExp.test(line)) lyricLines.push(stripWordTimes(line));
    else if (line) translatedLines.push(line);
  }
  if (!info.lyric && lyricLines.length) info.lyric = [...tags, ...lyricLines].join('\n');
  if (translatedLines.length) info.tlyric = [...tags, ...translatedLines].join('\n');
  try {
    const parsedLrcx = lrcx.parse(text);
    info.lxlyric = lyricToLxLrc(parsedLrcx);
  } catch {
    info.lxlyric = '';
  }
  return info;
};

const tryParseLrc = text => {
  try {
    return lrc.parse(stripWordTimes(text));
  } catch {
    return null;
  }
};

const buildParams = (id, isGetLyricx) => {
  let params = `user=12345,web,web,web&requester=localhost&req=1&rid=MUSIC_${id}`;
  if (isGetLyricx) params += '&lrcx=1';
  const input = Buffer.from(params);
  const output = new Uint16Array(input.length);
  for (let i = 0; i < input.length; i++) output[i] = key[i % key.length] ^ input[i];
  return Buffer.from(output).toString('base64');
};

const decodeLyric = async (buffer, isGetLyricx) => {
  if (!buffer || buffer.toString('utf8', 0, 10) !== 'tp=content') return '';
  const inflated = await inflateBuffer(buffer.subarray(buffer.indexOf('\r\n\r\n') + 4));
  if (!isGetLyricx) return iconv.decode(inflated, 'gb18030');

  const encoded = Buffer.from(inflated.toString(), 'base64');
  const output = Buffer.alloc(encoded.length);
  for (let i = 0; i < encoded.length; i++) output[i] = encoded[i] ^ key[i % key.length];
  return iconv.decode(output, 'gb18030');
};
