import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTestHandlers,
  invokeHttp,
  tempRoot,
  withRealSourceEnv
} from './support/helpers.js';

test('health endpoint reports ok', async () => {
  await withRealSourceEnv(async () => {
    const { httpHandler } = await createTestHandlers();
    const health = await invokeHttp(httpHandler, 'GET', '/health');
    assert.equal(health.statusCode, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.data.status, 'ok');
  }, { files: [], root: `${tempRoot}-health` });
});
