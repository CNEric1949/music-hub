import test from 'node:test';
import assert from 'node:assert/strict';
import { qqSearchRetryDelay } from '../src/core/sources/builtin.js';

test('QQ search retry delay uses conservative exponential backoff capped at 30 seconds', () => {
  assert.equal(qqSearchRetryDelay(1, () => 0), 5000);
  assert.equal(qqSearchRetryDelay(2, () => 0), 10000);
  assert.equal(qqSearchRetryDelay(3, () => 0), 20000);
  assert.equal(qqSearchRetryDelay(4, () => 0), 30000);
  assert.equal(qqSearchRetryDelay(3, () => 0.75), 20750);
});
