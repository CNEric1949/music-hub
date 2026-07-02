import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createTestHandlers,
  fspExists,
  invokeHttp,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

test('lyric save writes merged translated, romanized, and LX lyric variants', { timeout: 30000 }, async () => {
  await withRealSourceEnv(async root => {
    const { httpHandler } = await createTestHandlers();
    const config = await invokeHttp(httpHandler, 'PATCH', '/config', {
      download: {
        mergeTranslatedLyric: true,
        mergeRomanLyric: true,
        mergeLxLyric: true
      }
    });
    assert.equal(config.statusCode, 200);

    const saved = await invokeHttp(httpHandler, 'POST', '/lyrics/save', {
      songInfo: { source: 'kw', name: '紅蓮華', singer: 'LiSA' },
      fileName: 'gurenge-merged',
      saveAll: true,
      lyricInfo: {
        lyric: '[00:00.000]紅蓮華',
        tlyric: '[00:00.000]红莲华',
        rlyric: '[00:00.000]gurenge',
        lxlyric: '[00:00.000]<0,500,0>紅蓮華'
      }
    });

    assert.equal(saved.statusCode, 200);
    const { filePath, files } = saved.body.data;
    assert.equal(path.dirname(filePath), path.join(root, 'downloads'));
    assert.equal(await fspExists(filePath), true);
    assert.equal(await fspExists(files.translatedLyric), true);
    assert.equal(await fspExists(files.romanLyric), true);
    assert.equal(await fspExists(files.lxLyric), true);

    const merged = await fs.readFile(filePath, 'utf8');
    assert.match(merged, /紅蓮華/);
    assert.match(merged, /红莲华/);
    assert.match(merged, /gurenge/);
    assert.match(merged, /\[awlrc:/);
    assert.match(await fs.readFile(files.translatedLyric, 'utf8'), /红莲华/);
    assert.match(await fs.readFile(files.romanLyric, 'utf8'), /gurenge/);
    assert.match(await fs.readFile(files.lxLyric, 'utf8'), /<0,500,0>紅蓮華/);
  }, { files: [], root: `${tempRoot}-lyrics-save` });
});
