import { httpFetch } from '../../../utils/request.js';
import { coverFailure, coverResult, firstCover } from './common.js';

export const getKgCover = async songInfo => {
  const failures = [];
  let resourceCover = null;
  try {
    resourceCover = await getResourceCover(songInfo);
  } catch (error) {
    failures.push(coverFailure('resource', error));
  }
  const fallback = songInfo.img
    ? coverResult(songInfo.img, { source: 'kg', sourceType: 'album', provider: 'search-result', fallback: true })
    : null;
  const result = firstCover(resourceCover, fallback);
  if (!result) throw new Error(failures[0]?.message || 'Kugou cover not found');
  return { ...result, raw: { failures } };
};

const getResourceCover = async songInfo => {
  if (!songInfo.songmid && !songInfo.hash) throw new Error('Kugou cover requires songmid or hash');
  const albumAudioId = String(songInfo.songmid || '').length === 32
    ? String(songInfo.audioId || songInfo.songmid).split('_')[0]
    : songInfo.songmid;
  const response = await httpFetch('http://media.store.kugou.com/v1/get_res_privilege', {
    method: 'POST',
    headers: {
      'KG-RC': '1',
      'KG-THash': 'expand_search_manager.cpp:852736169:451',
      'User-Agent': 'KuGou2012-9020-ExpandSearchManager'
    },
    body: {
      appid: 1001,
      area_code: '1',
      behavior: 'play',
      clientver: '9020',
      need_hash_offset: 1,
      relate: 1,
      resource: [{
        album_audio_id: albumAudioId,
        album_id: songInfo.albumId,
        hash: songInfo.hash || songInfo.songmid,
        id: 0,
        name: `${songInfo.singer || ''} - ${songInfo.name || ''}.mp3`,
        type: 'audio'
      }],
      token: '',
      userid: 2626431536,
      vip: 1
    }
  });
  if (response.body?.error_code !== 0) throw new Error('Kugou cover API returned error');
  const info = response.body?.data?.[0]?.info;
  const url = info?.imgsize ? info.image?.replace('{size}', info.imgsize[0]) : info?.image;
  if (!url) throw new Error('Kugou cover API returned empty URL');
  return coverResult(url, { source: 'kg', sourceType: 'resource', provider: 'kugou-res-privilege' });
};
