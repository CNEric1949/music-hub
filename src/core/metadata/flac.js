import fs from 'node:fs/promises';

const STREAMINFO = 0;
const VORBIS_COMMENT = 4;
const PICTURE = 6;
const vendor = 'music-hub';

export const writeFlacMetadata = async ({ filePath, meta = {}, lyrics = '', coverPath = null }) => {
  const original = await fs.readFile(filePath);
  if (original.subarray(0, 4).toString('ascii') !== 'fLaC') {
    throw new Error('Invalid FLAC file');
  }
  const { blocks, audioStart } = parseBlocks(original);
  const comments = buildComments(meta, lyrics);
  const nextBlocks = [];
  let inserted = false;

  for (const block of blocks) {
    if (block.type === VORBIS_COMMENT || block.type === PICTURE) continue;
    nextBlocks.push({ type: block.type, data: block.data });
    if (!inserted && block.type === STREAMINFO) {
      if (comments.length) nextBlocks.push({ type: VORBIS_COMMENT, data: vorbisCommentBlock(comments) });
      if (coverPath) nextBlocks.push({ type: PICTURE, data: await pictureBlock(coverPath) });
      inserted = true;
    }
  }
  if (!inserted) {
    if (comments.length) nextBlocks.unshift({ type: VORBIS_COMMENT, data: vorbisCommentBlock(comments) });
    if (coverPath) nextBlocks.push({ type: PICTURE, data: await pictureBlock(coverPath) });
  }
  if (!comments.length && !coverPath) return { format: 'flac', embedded: false };

  const metadata = Buffer.concat(nextBlocks.map((block, index) => encodeBlock(block, index === nextBlocks.length - 1)));
  await fs.writeFile(filePath, Buffer.concat([Buffer.from('fLaC', 'ascii'), metadata, original.subarray(audioStart)]));
  return {
    format: 'flac',
    embedded: true,
    blocks: nextBlocks.map(block => block.type)
  };
};

const parseBlocks = buffer => {
  const blocks = [];
  let offset = 4;
  while (offset + 4 <= buffer.length) {
    const header = buffer[offset];
    const isLast = Boolean(header & 0x80);
    const type = header & 0x7f;
    const length = buffer.readUIntBE(offset + 1, 3);
    const dataStart = offset + 4;
    const dataEnd = dataStart + length;
    if (dataEnd > buffer.length) throw new Error('Invalid FLAC metadata block');
    blocks.push({ type, data: buffer.subarray(dataStart, dataEnd) });
    offset = dataEnd;
    if (isLast) break;
  }
  return { blocks, audioStart: offset };
};

const encodeBlock = (block, isLast) => {
  const header = Buffer.alloc(4);
  header[0] = (isLast ? 0x80 : 0) | block.type;
  header.writeUIntBE(block.data.length, 1, 3);
  return Buffer.concat([header, block.data]);
};

const buildComments = (meta, lyrics) => [
  ['TITLE', meta.title],
  ['ARTIST', meta.artist],
  ['ALBUM', meta.album],
  ['LYRICS', lyrics || meta.lyrics]
]
  .filter(([, value]) => String(value || '').trim())
  .map(([key, value]) => `${key}=${String(value).trim()}`);

const vorbisCommentBlock = comments => {
  const vendorBuffer = Buffer.from(vendor, 'utf8');
  const commentBuffers = comments.map(comment => Buffer.from(comment, 'utf8'));
  const parts = [uint32le(vendorBuffer.length), vendorBuffer, uint32le(commentBuffers.length)];
  for (const comment of commentBuffers) parts.push(uint32le(comment.length), comment);
  return Buffer.concat(parts);
};

const pictureBlock = async coverPath => {
  const picture = await fs.readFile(coverPath);
  const info = imageInfo(picture);
  const mime = Buffer.from(info.mime, 'utf8');
  const description = Buffer.alloc(0);
  return Buffer.concat([
    uint32be(3),
    uint32be(mime.length),
    mime,
    uint32be(description.length),
    description,
    uint32be(info.width),
    uint32be(info.height),
    uint32be(info.depth),
    uint32be(0),
    uint32be(picture.length),
    picture
  ]);
};

const imageInfo = buffer => {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && buffer.length >= 26) {
    return {
      mime: 'image/png',
      width: buffer.readUInt32BE(16),
      height: buffer.readUInt32BE(20),
      depth: buffer[24] || 32
    };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    const size = jpegSize(buffer);
    return { mime: 'image/jpeg', width: size.width, height: size.height, depth: 24 };
  }
  return { mime: 'image/jpeg', width: 0, height: 0, depth: 0 };
};

const jpegSize = buffer => {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
};

const uint32le = value => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
};

const uint32be = value => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value);
  return buffer;
};
