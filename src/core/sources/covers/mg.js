import { httpFetch } from '../../../utils/request.js';
import { coverFailure, coverResult, firstCover } from './common.js';

export const getMgCover = async songInfo => {
  const failures = [];
  let songCover = null;
  try {
    songCover = await getSongCover(songInfo);
  } catch (error) {
    failures.push(coverFailure('song', error));
  }
  const fallback = songInfo.img
    ? coverResult(songInfo.img, { source: 'mg', sourceType: 'album', provider: 'search-result', fallback: true })
    : null;
  const result = firstCover(songCover, fallback);
  if (!result) throw new Error(failures[0]?.message || 'Migu cover not found');
  return { ...result, raw: { failures } };
};

const getSongCover = async songInfo => {
  const songId = songInfo.songmid || songInfo.songId || songInfo.id;
  if (!songId) throw new Error('Migu song cover requires song id');
  const response = await httpFetch(`http://music.migu.cn/v3/api/music/audioPlayer/getSongPic?songId=${songId}`, {
    headers: { Referer: 'http://music.migu.cn/v3/music/player/audio?from=migu' }
  });
  if (response.body?.returnCode !== '000000') throw new Error('Migu cover API returned error');
  const url = response.body.largePic || response.body.mediumPic || response.body.smallPic;
  if (!url) throw new Error('Migu cover API returned empty URL');
  return coverResult(url, { source: 'mg', sourceType: 'song', provider: 'migu-song-pic' });
};
