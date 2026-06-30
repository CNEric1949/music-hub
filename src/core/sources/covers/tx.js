import { httpFetch } from '../../../utils/request.js';
import { coverFailure, coverResult, firstCover } from './common.js';

export const getTxCover = async songInfo => {
  const failures = [];
  let songCover = null;
  try {
    songCover = await getSongDetailCover(songInfo);
  } catch (error) {
    failures.push(coverFailure('song-detail', error));
  }
  const albumCover = getAlbumCover(songInfo);
  const searchCover = songInfo.img
    ? coverResult(songInfo.img, { source: 'tx', sourceType: 'album', provider: 'search-result', fallback: true })
    : null;
  const result = firstCover(songCover, albumCover, searchCover);
  if (!result) throw new Error(failures[0]?.message || 'QQ cover not found');
  return { ...result, raw: { failures } };
};

const getSongDetailCover = async songInfo => {
  if (!songInfo.songmid) throw new Error('QQ song cover requires songmid');
  const response = await httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
    method: 'post',
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; WOW64; Trident/5.0)' },
    body: {
      comm: { ct: '19', cv: '1859', uin: '0' },
      req: {
        module: 'music.pf_song_detail_svr',
        method: 'get_song_detail_yqq',
        param: { song_type: 0, song_mid: songInfo.songmid }
      }
    }
  });
  const track = response.body?.req?.data?.track_info;
  const albumMid = track?.album?.mid;
  if (!albumMid) throw new Error('QQ song detail returned no album mid');
  return coverResult(albumUrl(albumMid), { source: 'tx', sourceType: 'song', provider: 'qq-song-detail' });
};

const getAlbumCover = songInfo => {
  const albumId = songInfo.albumMid || songInfo.albumId;
  if (!albumId) return null;
  return coverResult(albumUrl(albumId), { source: 'tx', sourceType: 'album', provider: 'qq-album-mid', fallback: true });
};

const albumUrl = albumId => `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albumId}.jpg`;
