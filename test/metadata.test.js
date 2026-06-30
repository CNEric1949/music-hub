import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createTestHandlers,
  fspExists,
  invokeHttp,
  keyword,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

test('metadata embed writes real MP3 tags without sidecar file', async () => {
  await withRealSourceEnv(async root => {
    const { httpHandler } = await createTestHandlers();
    const embedTarget = path.join(root, 'downloads', 'manual-embed.mp3');
    const coverPath = path.join(root, 'downloads', 'cover.png');
    await fs.mkdir(path.dirname(embedTarget), { recursive: true });
    await fs.writeFile(embedTarget, Buffer.from([0xff, 0xfb, 0x90, 0x64, ...Buffer.from('manual metadata target')]));
    await fs.writeFile(coverPath, png1x1);

    const metadataEmbed = await invokeHttp(httpHandler, 'POST', '/metadata/embed', {
      filePath: embedTarget,
      meta: { title: keyword, artist: 'Beyond', album: 'test' },
      lyricInfo: { lyric: '[00:00.000]test' },
      coverPath
    });
    assert.equal(metadataEmbed.statusCode, 200);
    assert.equal(metadataEmbed.body.data.embedded, true);
    assert.equal(metadataEmbed.body.data.format, 'mp3');
    assert.equal(metadataEmbed.body.data.sidecarPath, undefined);
    assert.equal(await fspExists(`${embedTarget}.music-hub-meta.json`), false);

    const bytes = await fs.readFile(embedTarget);
    assert.equal(bytes.subarray(0, 3).toString('ascii'), 'ID3');
    assert.ok(bytes.includes(Buffer.from('TIT2')));
    assert.ok(bytes.includes(Buffer.from('TPE1')));
    assert.ok(bytes.includes(Buffer.from('TALB')));
    assert.ok(bytes.includes(Buffer.from('USLT')));
    assert.ok(bytes.includes(Buffer.from('APIC')));
  }, { files: [], root: `${tempRoot}-metadata` });
});

test('metadata embed writes FLAC vorbis comments and picture block', async () => {
  await withRealSourceEnv(async root => {
    const { httpHandler } = await createTestHandlers();
    const embedTarget = path.join(root, 'downloads', 'manual-embed.flac');
    const coverPath = path.join(root, 'downloads', 'cover.png');
    await fs.mkdir(path.dirname(embedTarget), { recursive: true });
    await fs.writeFile(embedTarget, minimalFlac());
    await fs.writeFile(coverPath, png1x1);

    const metadataEmbed = await invokeHttp(httpHandler, 'POST', '/metadata/embed', {
      filePath: embedTarget,
      meta: { title: keyword, artist: 'LiSA', album: 'test album' },
      lyricInfo: { lyric: '[00:00.000]gurenge' },
      coverPath
    });
    assert.equal(metadataEmbed.statusCode, 200);
    assert.equal(metadataEmbed.body.data.embedded, true);
    assert.equal(metadataEmbed.body.data.format, 'flac');
    assert.equal(await fspExists(`${embedTarget}.music-hub-meta.json`), false);

    const bytes = await fs.readFile(embedTarget);
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'fLaC');
    assert.ok(bytes.includes(Buffer.from('TITLE=' + keyword)));
    assert.ok(bytes.includes(Buffer.from('ARTIST=LiSA')));
    assert.ok(bytes.includes(Buffer.from('ALBUM=test album')));
    assert.ok(bytes.includes(Buffer.from('LYRICS=[00:00.000]gurenge')));
    assert.ok(parseFlacBlockTypes(bytes).includes(4));
    assert.ok(parseFlacBlockTypes(bytes).includes(6));
  }, { files: [], root: `${tempRoot}-metadata-flac` });
});

const minimalFlac = () => Buffer.concat([
  Buffer.from('fLaC', 'ascii'),
  Buffer.from([0x80, 0x00, 0x00, 0x22]),
  Buffer.alloc(34),
  Buffer.from('audio')
]);

const parseFlacBlockTypes = buffer => {
  const types = [];
  let offset = 4;
  while (offset + 4 <= buffer.length) {
    const header = buffer[offset];
    const isLast = Boolean(header & 0x80);
    const type = header & 0x7f;
    const length = buffer.readUIntBE(offset + 1, 3);
    types.push(type);
    offset += 4 + length;
    if (isLast) break;
  }
  return types;
};

const png1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001' +
  '0d0a2db40000000049454e44ae426082',
  'hex'
);
