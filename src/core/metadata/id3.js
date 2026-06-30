import NodeID3 from 'node-id3';

export const writeMp3Metadata = async ({ filePath, meta = {}, lyrics = '', coverPath = null }) => {
  const tags = {
    title: clean(meta.title),
    artist: clean(meta.artist),
    album: clean(meta.album)
  };
  if (clean(lyrics || meta.lyrics)) {
    tags.unsynchronisedLyrics = {
      language: 'zho',
      text: clean(lyrics || meta.lyrics)
    };
  }
  if (coverPath) tags.image = coverPath;
  for (const [key, value] of Object.entries(tags)) {
    if (!value) delete tags[key];
  }
  if (!Object.keys(tags).length) return { format: 'mp3', embedded: false, warnings: ['No metadata fields to embed'] };
  const ok = NodeID3.write(tags, filePath);
  if (!ok) throw new Error('node-id3 failed to write MP3 tags');
  return {
    format: 'mp3',
    embedded: true,
    fields: Object.keys(tags)
  };
};

const clean = value => String(value || '').trim();
