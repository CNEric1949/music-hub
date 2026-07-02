import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchService } from '../src/core/search/service.js';

test('search isolates one source failure and returns successful source results', async () => {
  const sources = new Map([
    ['good-source', {
      id: 'good-source',
      enabled: true,
      capabilities: ['search'],
      async search({ keyword, limit }) {
        return {
          list: [{ source: 'good-source', name: keyword, singer: 'LiSA' }],
          total: 1,
          allPage: 1,
          limit
        };
      }
    }],
    ['broken-source', {
      id: 'broken-source',
      enabled: true,
      capabilities: ['search'],
      async search() {
        throw new Error('upstream search failed');
      }
    }]
  ]);
  const service = new SearchService({
    list: () => Array.from(sources.values()),
    get: id => sources.get(id),
    getPublic: id => sources.get(id)
  });

  const result = await service.search({ keyword: '紅蓮華', source: 'all', limit: 5 });

  assert.equal(result.keyword, '紅蓮華');
  assert.deepEqual(result.results.map(item => item.source), ['good-source']);
  assert.equal(result.results[0].list[0].singer, 'LiSA');
  assert.deepEqual(result.failures, [{
    source: 'broken-source',
    code: 'INTERNAL_ERROR',
    message: 'upstream search failed'
  }]);
});
