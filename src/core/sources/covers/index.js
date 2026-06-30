import { AppError, ERROR_CODES } from '../../../shared/errors.js';
import { getKgCover } from './kg.js';
import { getKwCover } from './kw.js';
import { getMgCover } from './mg.js';
import { getTxCover } from './tx.js';
import { getWyCover } from './wy.js';

const providers = {
  kg: getKgCover,
  kw: getKwCover,
  mg: getMgCover,
  tx: getTxCover,
  wy: getWyCover
};

export const getBuiltinCover = async (source, songInfo) => {
  const provider = providers[source];
  if (!provider) {
    throw new AppError(ERROR_CODES.SOURCE_CAPABILITY_UNSUPPORTED, `Source does not support capability: cover`, { source, capability: 'cover' }, 422);
  }
  const result = await provider(songInfo);
  if (!result?.url) {
    throw new AppError(ERROR_CODES.MUSIC_NOT_FOUND, 'Cover URL not found', { source, songInfo }, 404);
  }
  return result;
};
