import { AppError, ERROR_CODES, isAppError } from '../../shared/errors.js';
import { filterCompareText, normalizeKeyword, parseIntervalSeconds, splitSingers } from '../../shared/text.js';

export class SearchService {
  constructor(sourceManager) {
    this.sourceManager = sourceManager;
  }

  getSearchSources(source = 'all') {
    const sources = this.sourceManager.list()
      .filter(item => item.enabled && item.capabilities.includes('search'));
    if (!source || source === 'all') return sources;
    return [this.sourceManager.getPublic(source)].filter(item => item.capabilities.includes('search'));
  }

  async search({ keyword, name, singer, source = 'all', page = 1, limit = 20 }) {
    const query = normalizeKeyword(keyword || name, singer);
    if (!query) throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'keyword or name is required', {}, 400);

    const targets = this.getSearchSources(source);
    const results = [];
    const failures = [];

    await Promise.all(targets.map(async target => {
      try {
        const sdk = this.sourceManager.get(target.id);
        if (!sdk.enabled) throw new AppError(ERROR_CODES.SOURCE_DISABLED, `Source disabled: ${target.id}`, { source: target.id }, 403);
        const result = await sdk.search({ keyword: query, page: Number(page), limit: Number(limit) });
        results.push({
          source: target.id,
          list: result?.list || [],
          allPage: result?.allPage || 0,
          total: result?.total || 0,
          limit: result?.limit || Number(limit)
        });
      } catch (error) {
        failures.push({
          source: target.id,
          code: isAppError(error) ? error.code : ERROR_CODES.INTERNAL_ERROR,
          message: error.message
        });
      }
    }));

    return {
      keyword: query,
      results: results.sort((a, b) => a.source.localeCompare(b.source)),
      failures: failures.sort((a, b) => a.source.localeCompare(b.source))
    };
  }

  async match({ name, singer, albumName, interval, source = null, limit = 25 }) {
    const searchResult = await this.search({ name, singer, source: 'all', limit });
    const expected = {
      name: filterCompareText(name),
      singer: filterCompareText(splitSingers(singer)),
      albumName: filterCompareText(albumName),
      interval: parseIntervalSeconds(interval)
    };

    const candidates = [];
    for (const group of searchResult.results) {
      if (source && group.source === source) continue;
      for (const item of group.list) {
        const score = this.scoreMatch(expected, item);
        if (score > 0) candidates.push({ score, musicInfo: item });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    return {
      list: candidates.map(item => item.musicInfo),
      scored: candidates
    };
  }

  scoreMatch(expected, item) {
    const actualName = filterCompareText(item.name);
    const actualSinger = filterCompareText(splitSingers(item.singer));
    const actualAlbum = filterCompareText(item.albumName);
    const actualInterval = parseIntervalSeconds(item.interval);
    let score = 0;

    if (expected.name && actualName === expected.name) score += 50;
    else if (expected.name && (actualName.includes(expected.name) || expected.name.includes(actualName))) score += 25;

    if (expected.singer && actualSinger === expected.singer) score += 30;
    else if (expected.singer && (actualSinger.includes(expected.singer) || expected.singer.includes(actualSinger))) score += 15;

    if (expected.albumName && actualAlbum === expected.albumName) score += 10;

    if (expected.interval && actualInterval && Math.abs(expected.interval - actualInterval) < 5) score += 10;

    return score;
  }
}
