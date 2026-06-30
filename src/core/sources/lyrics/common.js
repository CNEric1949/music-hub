import crypto from 'node:crypto';
import { inflate } from 'node:zlib';

export const emptyLyric = (source, raw = {}) => ({
  lyric: '',
  tlyric: '',
  rlyric: '',
  lxlyric: '',
  source,
  raw
});

export const lyricFailure = (stage, error) => ({
  stage,
  message: error?.message || String(error)
});

export const mergeLyricInfo = (primary, fallback) => ({
  lyric: primary?.lyric || fallback?.lyric || '',
  tlyric: primary?.tlyric || fallback?.tlyric || '',
  rlyric: primary?.rlyric || fallback?.rlyric || '',
  lxlyric: primary?.lxlyric || fallback?.lxlyric || ''
});

export const hasAnyLyric = info => Boolean(info?.lyric || info?.tlyric || info?.rlyric || info?.lxlyric);

export const msFormat = value => {
  const timeMs = Number(value);
  if (!Number.isFinite(timeMs)) return '';
  const ms = Math.floor(timeMs % 1000);
  const totalSeconds = Math.floor(timeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}]`;
};

export const intervalToMs = interval => {
  if (!interval) return 0;
  const parts = String(interval).split(/[:.]/).map(part => Number(part || 0));
  while (parts.length < 3) parts.unshift(0);
  const [minutes, seconds, ms] = parts.slice(-3);
  return minutes * 60_000 + seconds * 1000 + ms;
};

export const lyricToPlainLrc = lyric => {
  if (!lyric?.content?.length) return '';
  const lines = lyric.content
    .map(line => {
      const content = Array.isArray(line.content)
        ? line.content.map(word => word.content || '').join('')
        : line.content || '';
      return content ? `${msFormat(line.start)}${content}` : '';
    })
    .filter(Boolean);
  return [...lyricTags(lyric), ...lines].join('\n');
};

export const lyricToLxLrc = lyric => {
  if (!lyric?.content?.length) return '';
  const lines = lyric.content
    .map(line => {
      if (!Array.isArray(line.content)) return '';
      const words = line.content.map(word => `<${word.start || 0},${word.duration || 0}>${word.content || ''}`).join('');
      return words ? `${msFormat(line.start)}${words}` : '';
    })
    .filter(Boolean);
  return lines.join('\n');
};

export const parseRegularText = text => text ? String(text).trim() : '';

export const stripWordTimes = text => String(text || '').replace(/<(-?\d+),(-?\d+)(?:,-?\d+)?>/g, '');

export const alignTimedLyric = (target, base) => {
  if (!target || !base) return target || '';
  const targetLines = target.split('\n');
  let baseLines = base.split('\n');
  const aligned = [];
  const timeRxp = /^\[([\d:.]+)\]/;
  for (const line of targetLines) {
    const targetMatch = timeRxp.exec(line);
    if (!targetMatch) continue;
    const words = line.replace(timeRxp, '');
    if (!words.trim()) continue;
    const targetTime = intervalToMs(targetMatch[1]);
    while (baseLines.length) {
      const baseLine = baseLines.shift();
      const baseMatch = timeRxp.exec(baseLine);
      if (!baseMatch) continue;
      if (Math.abs(targetTime - intervalToMs(baseMatch[1])) < 100) {
        aligned.push(line.replace(timeRxp, baseMatch[0]));
        break;
      }
    }
  }
  return aligned.join('\n');
};

export const inflateBuffer = data => new Promise((resolve, reject) => {
  inflate(data, (error, result) => {
    if (error) reject(error);
    else resolve(result);
  });
});

export const md5 = value => crypto.createHash('md5').update(value).digest('hex');

const lyricTags = lyric => [
  lyric.ti ? `[ti:${lyric.ti}]` : null,
  lyric.ar ? `[ar:${lyric.ar}]` : null,
  lyric.al ? `[al:${lyric.al}]` : null,
  lyric.by ? `[by:${lyric.by}]` : null,
  Number.isFinite(lyric.offset) ? `[offset:${lyric.offset}]` : null
].filter(Boolean);
