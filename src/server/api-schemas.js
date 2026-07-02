const qualityEnum = ['128k', '192k', '320k', 'flac', 'flac24bit', 'master'];
const platformEnum = ['all', 'kg', 'kw', 'mg', 'tx', 'wy'];

export const schemas = {
  ApiError: {
    type: 'object',
    required: ['ok', 'error'],
    properties: {
      ok: { type: 'boolean', const: false },
      error: {
        type: 'object',
        required: ['code', 'message', 'details'],
        properties: {
          code: { type: 'string', examples: ['SOURCE_CAPABILITY_UNSUPPORTED'] },
          message: { type: 'string' },
          details: { type: 'object', additionalProperties: true }
        }
      }
    }
  },
  HealthStatus: {
    type: 'object',
    required: ['status'],
    properties: {
      status: { type: 'string', examples: ['ok'] }
    }
  },
  RuntimeConfig: {
    type: 'object',
    properties: {
      server: { type: 'object', additionalProperties: true },
      paths: { type: 'object', additionalProperties: true },
      sources: {
        type: 'object',
        properties: {
          multiSourceEnabled: { type: 'boolean' }
        },
        additionalProperties: true
      },
      download: {
        type: 'object',
        properties: {
          quality: { type: 'string', enum: qualityEnum },
          qualityStrategy: { type: 'string', enum: ['specified', 'highest', 'lowest'] },
          sourceStrategy: { type: 'string', enum: ['specified', 'all'] },
          retryCount: { type: 'integer', minimum: 0 },
          retryIntervalMs: { type: 'integer', minimum: 0 }
        },
        additionalProperties: true
      },
      http: { type: 'object', additionalProperties: true },
      logging: { type: 'object', additionalProperties: true }
    }
  },
  RuntimeConfigUpdate: {
    type: 'object',
    properties: {
      sources: {
        type: 'object',
        properties: {
          multiSourceEnabled: { type: 'boolean' }
        },
        additionalProperties: true
      },
      download: {
        type: 'object',
        properties: {
          quality: { type: 'string', enum: qualityEnum },
          qualityStrategy: { type: 'string', enum: ['specified', 'highest', 'lowest'] },
          sourceStrategy: { type: 'string', enum: ['specified', 'all'] },
          maxConcurrency: { type: 'integer', minimum: 1 },
          retryCount: { type: 'integer', minimum: 0 },
          retryIntervalMs: { type: 'integer', minimum: 0 },
          resumeOnStartup: { type: 'boolean' },
          skipExistingFile: { type: 'boolean' },
          embedCover: { type: 'boolean' },
          saveCoverFile: { type: 'boolean' },
          embedLyric: { type: 'boolean' },
          saveLyricFile: { type: 'boolean' },
          mergeLyric: { type: 'boolean' },
          mergeTranslatedLyric: { type: 'boolean' },
          mergeRomanLyric: { type: 'boolean' },
          mergeLxLyric: { type: 'boolean' }
        },
        additionalProperties: true
      }
    },
    additionalProperties: false
  },
  MusicQuality: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: qualityEnum, examples: ['128k'] },
      size: { type: ['string', 'null'], examples: ['4.96MB'] },
      hash: { type: 'string' }
    },
    additionalProperties: true
  },
  SongInfo: {
    type: 'object',
    required: ['source', 'name'],
    properties: {
      source: { type: 'string', examples: ['kg'], description: 'Music platform id.' },
      songmid: { type: ['string', 'number'], examples: ['123456'] },
      songId: { type: ['string', 'number'] },
      copyrightId: { type: 'string' },
      name: { type: 'string', examples: ['海阔天空'] },
      singer: { type: 'string', examples: ['BEYOND'] },
      albumName: { type: 'string' },
      albumId: { type: ['string', 'number'] },
      interval: { type: 'string', examples: ['5:27'] },
      img: { type: 'string', examples: ['https://example.com/cover.jpg'] },
      types: { type: 'array', items: { $ref: '#/components/schemas/MusicQuality' } },
      meta: { type: 'object', additionalProperties: true }
    },
    additionalProperties: true
  },
  Source: {
    type: 'object',
    required: ['id', 'name', 'type', 'enabled', 'initialized', 'capabilities'],
    properties: {
      id: { type: 'string', examples: ['新聚合APIV3'] },
      name: { type: 'string' },
      type: { type: 'string', enum: ['builtin', 'custom'] },
      enabled: { type: 'boolean' },
      initialized: { type: 'boolean' },
      version: { type: 'string' },
      updateUrl: { type: ['string', 'null'] },
      supportedQualities: { type: 'array', items: { type: 'string', enum: qualityEnum } },
      capabilities: {
        type: 'array',
        items: { type: 'string', enum: ['search', 'url', 'lyric', 'cover', 'album', 'singer', 'detail'] }
      },
      platforms: { type: 'array', items: { type: 'string' } },
      platformQualities: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string', enum: qualityEnum } }
      },
      status: { type: 'string', examples: ['ok'] },
      error: { type: ['string', 'null'] },
      initMessage: { type: 'string' },
      update: {
        type: 'object',
        properties: {
          available: { type: 'boolean' },
          message: { type: 'string' },
          checkedAt: { type: ['string', 'null'], format: 'date-time' },
          info: { type: ['object', 'null'], additionalProperties: true }
        }
      }
    }
  },
  SourceInput: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Required when creating a source.' },
      name: { type: 'string' },
      fileName: { type: 'string', examples: ['my-source.js'] },
      code: { type: 'string', description: 'LX source script content. If provided, it is written to sourcesDir.' },
      filePath: { type: 'string', description: 'Local source script path for file upload/import scenarios.' },
      url: { type: 'string', description: 'Remote source script URL for online import.' },
      enabled: { type: 'boolean', default: true },
      updateUrl: { type: ['string', 'null'] }
    }
  },
  SourceReloadInput: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Optional source id. Omit to reload all sources.' }
    }
  },
  SourceUpdateCheck: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      updateUrl: { type: ['string', 'null'] },
      available: { type: 'boolean' },
      message: { type: 'string' },
      checkedAt: { type: ['string', 'null'], format: 'date-time' },
      info: { type: ['object', 'null'], additionalProperties: true }
    }
  },
  SourceDeleteResult: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      deleted: { type: 'boolean' }
    }
  },
  SearchInput: {
    type: 'object',
    properties: {
      keyword: { type: 'string', examples: ['海阔天空'] },
      name: { type: 'string', description: 'Alias input used with singer when keyword is omitted.' },
      singer: { type: 'string' },
      source: { type: 'string', enum: platformEnum, default: 'all' },
      page: { type: 'integer', minimum: 1, default: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 }
    }
  },
  SearchGroup: {
    type: 'object',
    properties: {
      source: { type: 'string', examples: ['kg'] },
      list: { type: 'array', items: { $ref: '#/components/schemas/SongInfo' } },
      allPage: { type: 'integer' },
      total: { type: 'integer' },
      limit: { type: 'integer' }
    }
  },
  SourceFailure: {
    type: 'object',
    properties: {
      source: { type: 'string' },
      code: { type: 'string' },
      message: { type: 'string' }
    }
  },
  SearchResponse: {
    type: 'object',
    properties: {
      keyword: { type: 'string' },
      results: { type: 'array', items: { $ref: '#/components/schemas/SearchGroup' } },
      failures: { type: 'array', items: { $ref: '#/components/schemas/SourceFailure' } }
    }
  },
  MatchInput: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', examples: ['海阔天空'] },
      singer: { type: 'string', examples: ['BEYOND'] },
      albumName: { type: 'string' },
      interval: { type: ['string', 'number'], examples: ['5:27'] },
      source: { type: 'string', description: 'Original platform to exclude from cross-source candidates.' },
      limit: { type: 'integer', default: 25 }
    }
  },
  MatchResponse: {
    type: 'object',
    properties: {
      list: { type: 'array', items: { $ref: '#/components/schemas/SongInfo' } },
      scored: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            score: { type: 'number' },
            musicInfo: { $ref: '#/components/schemas/SongInfo' }
          }
        }
      }
    }
  },
  MusicUrlInput: {
    type: 'object',
    required: ['songInfo'],
    properties: {
      songInfo: { $ref: '#/components/schemas/SongInfo' },
      source: { type: 'string', description: 'Platform id. Omit for all matched platforms.' },
      platform: { type: 'string', description: 'Alias of source.' },
      provider: { type: 'string', description: 'Music source provider id. Omit to try all matching providers once.' },
      providerId: { type: 'string', description: 'Alias of provider.' },
      quality: { type: 'string', enum: qualityEnum, description: 'Omit for all qualities.' },
      type: { type: 'string', enum: qualityEnum, description: 'Alias of quality.' },
      allSources: { type: 'boolean', description: 'Force all-platform URL resolving.' },
      allQualities: { type: 'boolean', description: 'Force all-quality URL resolving.' }
    }
  },
  MusicUrlResult: {
    type: 'object',
    properties: {
      url: { type: 'string', examples: ['https://example.com/music.mp3'] },
      type: { type: ['string', 'null'], enum: [...qualityEnum, null], description: '`null` is allowed for local-source URL semantics.' },
      provider: { type: 'string', description: 'Source provider id, often the custom LX source id.' }
    },
    additionalProperties: true
  },
  MusicUrlMap: {
    oneOf: [
      { $ref: '#/components/schemas/MusicUrlResult' },
      { $ref: '#/components/schemas/MusicUrlResolveResponse' }
    ]
  },
  MusicUrlFailure: {
    type: 'object',
    properties: {
      provider: { type: 'string' },
      source: { type: 'string' },
      quality: { type: 'string' },
      code: { type: 'string' },
      message: { type: 'string' }
    }
  },
  MusicUrlGroup: {
    type: 'object',
    properties: {
      source: { type: 'string' },
      urls: {
        type: 'object',
        description: 'Quality-to-URL map ordered from low to high quality.',
        additionalProperties: { $ref: '#/components/schemas/MusicUrlResult' }
      }
    }
  },
  MusicUrlResolveResponse: {
    type: 'object',
    properties: {
      results: { type: 'array', items: { $ref: '#/components/schemas/MusicUrlGroup' } },
      failures: { type: 'array', items: { $ref: '#/components/schemas/MusicUrlFailure' } }
    }
  },
  LyricInfo: {
    type: 'object',
    properties: {
      lyric: { type: 'string', description: 'Main LRC lyric.' },
      tlyric: { type: 'string', description: 'Translated lyric.' },
      rlyric: { type: 'string', description: 'Romanized lyric.' },
      lxlyric: { type: 'string', description: 'LX enhanced lyric.' },
      raw: { type: 'object', additionalProperties: true }
    }
  },
  LyricSaveInput: {
    type: 'object',
    properties: {
      songInfo: { $ref: '#/components/schemas/SongInfo' },
      lyricInfo: { $ref: '#/components/schemas/LyricInfo' },
      fileName: { type: 'string' },
      saveAll: { type: 'boolean', default: true }
    }
  },
  FileResult: {
    type: 'object',
    properties: {
      filePath: { type: 'string' },
      files: { type: 'object', additionalProperties: { type: 'string' } }
    }
  },
  CoverInput: {
    type: 'object',
    properties: {
      songInfo: { $ref: '#/components/schemas/SongInfo' },
      url: { type: 'string', description: 'Optional direct cover URL.' },
      fileName: { type: 'string' }
    }
  },
  CoverResult: {
    type: 'object',
    properties: {
      url: { type: 'string' },
      filePath: { type: 'string' },
      source: { type: 'string' },
      sourceType: { type: 'string', enum: ['song', 'album', 'resource', 'custom'] },
      provider: { type: 'string' },
      fallback: { type: 'boolean' },
      raw: { type: 'object', additionalProperties: true }
    }
  },
  DownloadOptions: {
    type: 'object',
    properties: {
      embedCover: { type: 'boolean', default: true },
      saveCoverFile: { type: 'boolean', default: true },
      embedLyric: { type: 'boolean', default: false },
      saveLyricFile: { type: 'boolean', default: false },
      mergeTranslatedLyric: { type: 'boolean', default: false },
      mergeRomanLyric: { type: 'boolean', default: false },
      mergeLxLyric: { type: 'boolean', default: true }
    },
    additionalProperties: true
  },
  DownloadInput: {
    type: 'object',
    required: ['songInfo'],
    properties: {
      songInfo: { $ref: '#/components/schemas/SongInfo' },
      musicInfo: { $ref: '#/components/schemas/SongInfo' },
      autoStart: { type: 'boolean', default: true },
      url: { type: 'string', description: 'Optional resolved music URL.' },
      quality: { type: 'string', enum: qualityEnum },
      type: { type: 'string', enum: qualityEnum },
      qualityStrategy: { type: 'string', enum: ['specified', 'highest', 'lowest'] },
      sourceStrategy: { type: 'string', enum: ['specified', 'all'] },
      source: { type: 'string', description: 'When platform is set, source is the URL provider id; otherwise it is the target platform id.' },
      platform: { type: 'string', description: 'Target music platform id.' },
      provider: { type: 'string', description: 'URL provider/source id.' },
      providerId: { type: 'string' },
      sourceId: { type: 'string' },
      retryCount: { type: 'integer', minimum: 0 },
      retryIntervalMs: { type: 'integer', minimum: 0 },
      fileName: { type: 'string' },
      options: { $ref: '#/components/schemas/DownloadOptions' }
    }
  },
  DownloadTask: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      status: { type: 'string', enum: ['waiting', 'running', 'retrying', 'paused', 'completed', 'failed', 'canceled'] },
      musicInfo: { $ref: '#/components/schemas/SongInfo' },
      quality: { type: 'string' },
      qualityStrategy: { type: 'string' },
      sourceStrategy: { type: 'string' },
      platform: { type: ['string', 'null'] },
      provider: { type: ['string', 'null'] },
      url: { type: ['string', 'null'] },
      filePath: { type: 'string' },
      artifacts: { type: 'object', additionalProperties: true },
      progress: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          downloaded: { type: 'integer' },
          percent: { type: 'number' },
          speed: { type: 'number' }
        }
      },
      attempts: { type: 'integer' },
      maxRetries: { type: 'integer' },
      retryIntervalMs: { type: 'integer' },
      deleted: { type: 'boolean' },
      options: { $ref: '#/components/schemas/DownloadOptions' },
      error: { type: ['object', 'null'], additionalProperties: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' }
    }
  },
  MetadataEmbedInput: {
    type: 'object',
    required: ['filePath'],
    properties: {
      filePath: { type: 'string' },
      meta: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          artist: { type: 'string' },
          album: { type: 'string' }
        },
        additionalProperties: true
      },
      lyricInfo: { $ref: '#/components/schemas/LyricInfo' },
      coverPath: { type: 'string' }
    }
  },
  MetadataEmbedResult: {
    type: 'object',
    properties: {
      filePath: { type: 'string' },
      embedded: { type: 'boolean' },
      format: { type: 'string' },
      fields: { type: 'array', items: { type: 'string' } },
      blocks: { type: 'array', items: { type: 'integer' } },
      coverPath: { type: ['string', 'null'] },
      lyricEmbedded: { type: 'boolean' },
      warnings: { type: 'array', items: { type: 'string' } }
    }
  },
  IdInput: {
    type: 'object',
    required: ['id'],
    properties: {
      id: { type: 'string' }
    }
  },
  EmptyInput: {
    type: 'object',
    additionalProperties: false
  }
};

export const okEnvelope = schema => ({
  type: 'object',
  required: ['ok', 'data'],
  properties: {
    ok: { type: 'boolean', const: true },
    data: schema
  }
});

export const jsonContent = schema => ({
  'application/json': { schema }
});

export const jsonRequest = (schema, required = true) => ({
  required,
  content: jsonContent(schema)
});

export const jsonResponse = (schema, description = 'OK') => ({
  description,
  content: jsonContent(okEnvelope(schema))
});

export const errorResponses = {
  400: { description: 'Validation error', content: jsonContent({ $ref: '#/components/schemas/ApiError' }) },
  404: { description: 'Not found', content: jsonContent({ $ref: '#/components/schemas/ApiError' }) },
  422: { description: 'Unsupported capability or invalid business state', content: jsonContent({ $ref: '#/components/schemas/ApiError' }) },
  500: { description: 'Internal error', content: jsonContent({ $ref: '#/components/schemas/ApiError' }) }
};

const rewriteRefsForMcp = value => {
  if (Array.isArray(value)) return value.map(rewriteRefsForMcp);
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === '$ref' && typeof child === 'string' && child.startsWith('#/components/schemas/')) {
      result[key] = child.replace('#/components/schemas/', '#/$defs/');
    } else {
      result[key] = rewriteRefsForMcp(child);
    }
  }
  return result;
};

const toMcpSchema = schema => ({
  ...rewriteRefsForMcp(schema),
  $defs: rewriteRefsForMcp(schemas)
});

const rawMcpInputSchemas = {
  get_config: schemas.EmptyInput,
  update_config: schemas.RuntimeConfigUpdate,
  list_music_sources: schemas.EmptyInput,
  get_music_source: schemas.IdInput,
  create_music_source: schemas.SourceInput,
  update_music_source: {
    allOf: [
      schemas.IdInput,
      schemas.SourceInput
    ]
  },
  delete_music_source: schemas.IdInput,
  enable_music_source: schemas.IdInput,
  disable_music_source: schemas.IdInput,
  reload_music_sources: schemas.SourceReloadInput,
  check_music_source_update: schemas.IdInput,
  search_music: schemas.SearchInput,
  match_music: schemas.MatchInput,
  get_music_url: schemas.MusicUrlInput,
  get_album_detail: {
    type: 'object',
    properties: {
      source: { type: 'string' },
      albumId: { type: ['string', 'number'] },
      songInfo: { $ref: '#/components/schemas/SongInfo' }
    }
  },
  get_singer_detail: {
    type: 'object',
    properties: {
      source: { type: 'string' },
      singerId: { type: ['string', 'number'] },
      singer: { type: 'string' },
      songInfo: { $ref: '#/components/schemas/SongInfo' }
    }
  },
  get_music_detail: {
    type: 'object',
    properties: {
      source: { type: 'string' },
      songInfo: { $ref: '#/components/schemas/SongInfo' }
    }
  },
  get_lyric: {
    type: 'object',
    required: ['songInfo'],
    properties: {
      songInfo: { $ref: '#/components/schemas/SongInfo' }
    }
  },
  get_cover: {
    type: 'object',
    required: ['songInfo'],
    properties: {
      songInfo: { $ref: '#/components/schemas/SongInfo' }
    }
  },
  create_download_task: schemas.DownloadInput,
  get_download_task: schemas.IdInput,
  embed_music_metadata: schemas.MetadataEmbedInput
};

export const mcpInputSchemas = Object.fromEntries(
  Object.entries(rawMcpInputSchemas).map(([name, schema]) => [name, toMcpSchema(schema)])
);
