import { httpFetch } from '../../../utils/request.js';
import { coverFailure, coverResult, firstCover } from './common.js';

export const getKwCover = async songInfo => {
  const failures = [];
  let songCover = null;
  try {
    songCover = await getSongCover(songInfo);
  } catch (error) {
    failures.push(coverFailure('song', error));
  }
  const fallback = songInfo.img
    ? coverResult(songInfo.img, { source: 'kw', sourceType: 'album', provider: 'search-result', fallback: true })
    : null;
  const result = firstCover(songCover, fallback);
  if (!result) throw new Error(failures[0]?.message || 'Kuwo cover not found');
  return { ...result, raw: { failures } };
};

const getSongCover = async songInfo => {
  if (!songInfo.songmid) throw new Error('Kuwo song cover requires songmid');
  const response = await httpFetch(`http://artistpicserver.kuwo.cn/pic.web?corp=kuwo&type=rid_pic&pictype=500&size=500&rid=${songInfo.songmid}`);
  if (!/^https?:\/\//.test(String(response.body || ''))) throw new Error('Kuwo song cover API returned empty URL');
  return coverResult(response.body, { source: 'kw', sourceType: 'song', provider: 'kuwo-rid-pic' });
};
