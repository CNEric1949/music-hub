import { httpFetch } from '../../../utils/request.js';
import { emptyLyric, hasAnyLyric, msFormat } from './common.js';

const delta = 2654435769n;
const minLength = 32;
const keyArr = [
  27303562373562475n,
  18014862372307051n,
  22799692160172081n,
  34058940340699235n,
  30962724186095721n,
  27303523720101991n,
  27303523720101998n,
  31244139033526382n,
  28992395054481524n
];

export const getMgLyric = async songInfo => {
  let info;
  if (songInfo.lrcUrl || songInfo.mrcUrl) {
    const lyricUrl = songInfo.mrcUrl || songInfo.lrcUrl;
    const lyricInfo = lyricUrl.endsWith('.mrc')
      ? await getMrc(lyricUrl)
      : await getLrc(lyricUrl);
    info = {
      lyric: lyricInfo.lyric || '',
      tlyric: await getTrc(songInfo.trcUrl),
      rlyric: '',
      lxlyric: lyricInfo.lxlyric || ''
    };
  } else {
    const songId = songInfo.songmid;
    const copyrightId = songInfo.copyrightId;
    if (!songId || !copyrightId) throw new Error('Migu lyric requires songmid and copyrightId');
    const response = await httpFetch(`https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/lyric/download.do?copyrightId=${copyrightId}&songId=${songId}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; U; Android 11.0.0; zh-cn; MI 11 Build/OPR1.170623.032) AppleWebKit/534.30 (KHTML, like Gecko) Version/4.0 Mobile Safari/534.30'
      }
    });
    info = {
      lyric: response.body?.lyric || '',
      tlyric: response.body?.translatedLyric || '',
      rlyric: '',
      lxlyric: ''
    };
  }
  if (!hasAnyLyric(info)) throw new Error('Migu lyric not found');
  return { ...info, source: 'mg', raw: { provider: 'fallback', failures: [] } };
};

const getText = async url => {
  if (!url) return '';
  const response = await httpFetch(url, {
    headers: {
      Referer: 'https://app.c.nf.migu.cn/',
      'User-Agent': 'Mozilla/5.0 (Linux; Android 5.1.1; Nexus 6 Build/LYZ28E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/59.0.3071.115 Mobile Safari/537.36',
      channel: '0146921'
    }
  });
  return response.body || '';
};

const getMrc = async url => parseMrc(decrypt(await getText(url)));
const getLrc = async url => ({ ...emptyLyric('mg'), lyric: await getText(url) });
const getTrc = async url => url ? await getText(url) : '';

const parseMrc = text => {
  const lrcLines = [];
  const lxLines = [];
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    const match = /^\s*\[(\d+),\d+\]/.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const words = line.replace(/^\s*\[(\d+),\d+\]/, '');
    lrcLines.push(`${msFormat(start)}${words.replace(/\(\d+,\d+\)/g, '')}`);
    const times = words.match(/(\(\d+,\d+\))/g);
    if (!times) continue;
    const wordArr = words.split(/\(\d+,\d+\)/);
    const lxWords = times.map((time, index) => {
      const wordTime = /\((\d+),(\d+)\)/.exec(time);
      return `<${Number(wordTime[1]) - start},${wordTime[2]}>${wordArr[index] || ''}`;
    }).join('');
    lxLines.push(`${msFormat(start)}${lxWords}`);
  }
  return { lyric: lrcLines.join('\n'), lxlyric: lxLines.join('\n') };
};

const decrypt = data => {
  if (data == null || data.length < minLength) return data;
  return longArrToString(teaDecrypt(toBigintArray(data), keyArr));
};

const toLong = value => {
  const max = 9223372036854775807n;
  const min = -9223372036854775808n;
  const num = typeof value === 'string' ? BigInt(`0x${value}`) : value;
  if (num > max) return toLong(num - (1n << 64n));
  if (num < min) return toLong(num + (1n << 64n));
  return num;
};

const longToBytes = value => {
  const result = Buffer.alloc(8);
  let current = value;
  for (let i = 0; i < 8; i++) {
    result[i] = Number(current & 0xffn);
    current >>= 8n;
  }
  return result;
};

const longArrToString = data => data.map(item => longToBytes(item).toString('utf16le')).join('');

const toBigintArray = data => {
  const length = Math.floor(data.length / 16);
  const result = Array(length);
  for (let i = 0; i < length; i++) result[i] = toLong(data.substring(i * 16, i * 16 + 16));
  return result;
};

const teaDecrypt = (data, key) => {
  const length = data.length;
  const lengthBigint = BigInt(length);
  if (length >= 1) {
    let first = data[0];
    let sum = toLong((6n + (52n / lengthBigint)) * delta);
    while (sum !== 0n) {
      const e = toLong(3n & toLong(sum >> 2n));
      let index = lengthBigint;
      while (true) {
        index--;
        if (index > 0n) {
          const previous = data[index - 1n];
          first = toLong(data[index] - (toLong(toLong(first ^ sum) + toLong(previous ^ key[toLong(toLong(3n & index) ^ e)])) ^ toLong(toLong(toLong(previous >> 5n) ^ toLong(first << 2n)) + toLong(toLong(first >> 3n) ^ toLong(previous << 4n)))));
          data[index] = first;
        } else break;
      }
      const last = data[lengthBigint - 1n];
      first = toLong(data[0] - toLong(toLong(toLong(key[toLong(toLong(index & 3n) ^ e)] ^ last) + toLong(first ^ sum)) ^ toLong(toLong(toLong(last >> 5n) ^ toLong(first << 2n)) + toLong(toLong(first >> 3n) ^ toLong(last << 4n)))));
      data[0] = first;
      sum = toLong(sum - delta);
    }
  }
  return data;
};
