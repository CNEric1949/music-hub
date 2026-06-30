import { getKgLyric } from './kg.js';
import { getKwLyric } from './kw.js';
import { getMgLyric } from './mg.js';
import { getTxLyric } from './tx.js';
import { getWyLyric } from './wy.js';

const lyricProviders = {
  kg: getKgLyric,
  kw: getKwLyric,
  mg: getMgLyric,
  tx: getTxLyric,
  wy: getWyLyric
};

export const getBuiltinLyric = async (source, songInfo) => {
  const provider = lyricProviders[source];
  if (!provider) throw new Error(`Lyric provider not found: ${source}`);
  return provider(songInfo);
};
