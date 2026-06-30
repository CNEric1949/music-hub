import { httpFetch } from '../../../utils/request.js';
import { coverFailure, coverResult, firstCover } from './common.js';

export const getWyCover = async songInfo => {
  const failures = [];
  let songCover = null;
  try {
    songCover = await getSongDetailCover(songInfo);
  } catch (error) {
    failures.push(coverFailure('song-detail', error));
  }
  const fallback = songInfo.img
    ? coverResult(songInfo.img, { source: 'wy', sourceType: 'album', provider: 'search-result', fallback: true })
    : null;
  const result = firstCover(songCover, fallback);
  if (!result) throw new Error(failures[0]?.message || 'Netease cover not found');
  return { ...result, raw: { failures } };
};

const getSongDetailCover = async songInfo => {
  if (!songInfo.songmid) throw new Error('Netease song cover requires songmid');
  const response = await httpFetch(`https://music.163.com/api/song/detail?ids=[${encodeURIComponent(songInfo.songmid)}]`, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      Referer: 'https://music.163.com/'
    }
  });
  const song = response.body?.songs?.[0];
  const url = song?.album?.picUrl || song?.al?.picUrl;
  if (!url) throw new Error('Netease song detail returned no cover URL');
  return coverResult(url, { source: 'wy', sourceType: 'song', provider: 'netease-song-detail' });
};
