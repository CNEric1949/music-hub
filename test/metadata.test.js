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

test('metadata embed writes sidecar file', async () => {
  await withRealSourceEnv(async root => {
    const { httpHandler } = await createTestHandlers();
    const embedTarget = path.join(root, 'downloads', 'manual-embed.mp3');
    await fs.mkdir(path.dirname(embedTarget), { recursive: true });
    await fs.writeFile(embedTarget, Buffer.from('manual metadata target'));

    const metadataEmbed = await invokeHttp(httpHandler, 'POST', '/metadata/embed', {
      filePath: embedTarget,
      meta: { title: keyword, artist: 'Beyond', album: 'test' },
      lyricInfo: { lyric: '[00:00.000]test' }
    });
    assert.equal(metadataEmbed.statusCode, 200);
    assert.ok(await fspExists(metadataEmbed.body.data.sidecarPath));
  }, { files: [], root: `${tempRoot}-metadata` });
});
