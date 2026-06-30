import { krc, utils } from 'smart-lyric';
import { httpFetch } from '../../../utils/request.js';
import {
  emptyLyric,
  hasAnyLyric,
  lyricFailure,
  lyricToLxLrc,
  lyricToPlainLrc,
  mergeLyricInfo,
  msFormat
} from './common.js';

export const getKgLyric = async songInfo => {
  const failures = [];
  let lyricRef = null;
  try {
    lyricRef = await searchLyric(songInfo);
  } catch (error) {
    failures.push(lyricFailure('search', error));
  }
  if (!lyricRef) throw new Error('Kugou lyric candidate not found');

  let primary = null;
  try {
    primary = await getSmartLyric(lyricRef);
  } catch (error) {
    failures.push(lyricFailure('smart-lyric', error));
  }

  let fallback = null;
  if (!primary?.lyric || !primary?.tlyric || !primary?.rlyric || !primary?.lxlyric) {
    try {
      fallback = await getFallbackLyric(lyricRef);
    } catch (error) {
      failures.push(lyricFailure('fallback', error));
    }
  }

  const info = mergeLyricInfo(primary, fallback);
  if (!hasAnyLyric(info)) throw new Error(failures[0]?.message || 'Kugou lyric not found');
  return { ...info, source: 'kg', raw: { provider: primary ? 'smart-lyric' : 'fallback', failures } };
};

const searchLyric = async songInfo => {
  const duration = songInfo._interval || intervalSeconds(songInfo.interval);
  const url = `http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(songInfo.name || '')}&hash=${songInfo.hash || ''}&timelength=${duration}&lrctxt=1`;
  const response = await httpFetch(url, { headers: kugouHeaders() });
  const candidate = response.body?.candidates?.[0];
  if (!candidate) return null;
  return {
    id: candidate.id,
    accesskey: candidate.accesskey,
    fmt: candidate.krctype == 1 && candidate.contenttype != 1 ? 'krc' : 'lrc'
  };
};

const getSmartLyric = async lyricRef => {
  const result = await utils.downloadKugouLyric(lyricRef);
  if (result.karaok) {
    const parsed = krc.parse(result.karaok);
    return {
      lyric: lyricToPlainLrc(parsed),
      tlyric: '',
      rlyric: '',
      lxlyric: lyricToLxLrc(parsed)
    };
  }
  if (result.regular) return { lyric: result.regular, tlyric: '', rlyric: '', lxlyric: '' };
  throw new Error('smart-lyric returned empty Kugou lyric');
};

const getFallbackLyric = async lyricRef => {
  const url = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${lyricRef.id}&accesskey=${lyricRef.accesskey}&fmt=${lyricRef.fmt}&charset=utf8`;
  const response = await httpFetch(url, { headers: kugouHeaders() });
  if (!response.body?.content) throw new Error('Kugou lyric download returned empty content');
  if (response.body.fmt === 'lrc') {
    return { lyric: Buffer.from(response.body.content, 'base64').toString('utf8'), tlyric: '', rlyric: '', lxlyric: '' };
  }
  return parseKrc(krc.decrypt(Buffer.from(response.body.content, 'base64')) || '');
};

const parseKrc = text => {
  const parsed = emptyLyric('kg');
  let body = String(text || '').replace(/\r/g, '');
  const language = body.match(/\[language:([\w=\\/+]+)\]/);
  let translations = null;
  let roman = null;
  if (language) {
    body = body.replace(/\[language:[\w=\\/+]+\]\n?/, '');
    const json = JSON.parse(Buffer.from(language[1], 'base64').toString());
    for (const item of json.content || []) {
      if (item.type === 0) roman = item.lyricContent;
      if (item.type === 1) translations = item.lyricContent;
    }
  }
  const lrcLines = [];
  const lxLines = [];
  let lineIndex = 0;
  for (const line of body.split('\n')) {
    const match = /\[(\d+),(\d+)\](.*)/.exec(line);
    if (!match) continue;
    const timeTag = msFormat(Number(match[1]));
    const words = match[3] || '';
    lrcLines.push(`${timeTag}${words.replace(/<\d+,\d+(?:,\d+)?>/g, '')}`);
    lxLines.push(`${timeTag}${words.replace(/<(\d+,\d+),\d+>/g, '<$1>')}`);
    if (translations) translations[lineIndex] = `${timeTag}${translations[lineIndex]?.join('') ?? ''}`;
    if (roman) roman[lineIndex] = `${timeTag}${roman[lineIndex]?.join('') ?? ''}`;
    lineIndex++;
  }
  parsed.lyric = lrcLines.join('\n');
  parsed.lxlyric = lxLines.join('\n');
  parsed.tlyric = translations ? translations.join('\n') : '';
  parsed.rlyric = roman ? roman.join('\n') : '';
  return parsed;
};

const intervalSeconds = interval => {
  if (!interval) return 0;
  return String(interval).split(':').reduce((total, item) => total * 60 + Number(item || 0), 0);
};

const kugouHeaders = () => ({
  'KG-RC': '1',
  'KG-THash': 'expand_search_manager.cpp:852736169:451',
  'User-Agent': 'KuGou2012-9020-ExpandSearchManager'
});
