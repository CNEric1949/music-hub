import { errorResponses, jsonRequest, jsonResponse, schemas } from '../api-schemas.js';

const sourceId = { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Music source id.' };
const taskId = { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'Download task id.' };

const op = ({ summary, description, request, response, parameters = [], deprecated = false }) => ({
  summary,
  description,
  deprecated,
  parameters,
  ...(request ? { requestBody: jsonRequest(request) } : {}),
  responses: {
    200: jsonResponse(response),
    ...errorResponses
  }
});

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'music-hub API',
    version: '0.1.0',
    description: 'HTTP API for LX Music source management, search, URL resolving, downloads, lyrics, covers, and metadata.'
  },
  servers: [
    { url: 'http://127.0.0.1:3000' }
  ],
  tags: [
    { name: 'System', description: 'Health and generated API documentation.' },
    { name: 'Sources', description: 'Music source import, CRUD, reload, initialization, and update prompt state.' },
    { name: 'Music', description: 'Search, match, details, and URL resolving.' },
    { name: 'Lyrics', description: 'Lyric retrieval and file saving.' },
    { name: 'Covers', description: 'Cover URL retrieval and cover downloading.' },
    { name: 'Downloads', description: 'Download task lifecycle and resume support.' },
    { name: 'Metadata', description: 'Metadata sidecar writing.' }
  ],
  paths: {
    '/health': {
      get: { tags: ['System'], ...op({ summary: 'Health check', response: { $ref: '#/components/schemas/HealthStatus' } }) }
    },
    '/config': {
      get: { tags: ['System'], ...op({ summary: 'Get runtime config', response: { $ref: '#/components/schemas/RuntimeConfig' } }) },
      patch: { tags: ['System'], ...op({ summary: 'Update runtime config for this process', request: { $ref: '#/components/schemas/RuntimeConfigUpdate' }, response: { $ref: '#/components/schemas/RuntimeConfig' } }) }
    },
    '/sources': {
      get: { tags: ['Sources'], ...op({ summary: 'List music sources', response: { type: 'array', items: { $ref: '#/components/schemas/Source' } } }) },
      post: { tags: ['Sources'], ...op({ summary: 'Create custom music source', request: { $ref: '#/components/schemas/SourceInput' }, response: { $ref: '#/components/schemas/Source' } }) }
    },
    '/sources/{id}': {
      get: { tags: ['Sources'], ...op({ summary: 'Get music source', parameters: [sourceId], response: { $ref: '#/components/schemas/Source' } }) },
      patch: { tags: ['Sources'], ...op({ summary: 'Update custom music source', parameters: [sourceId], request: { $ref: '#/components/schemas/SourceInput' }, response: { $ref: '#/components/schemas/Source' } }) },
      delete: { tags: ['Sources'], ...op({ summary: 'Delete custom music source', parameters: [sourceId], response: { $ref: '#/components/schemas/SourceDeleteResult' } }) }
    },
    '/sources/reload': {
      post: { tags: ['Sources'], ...op({ summary: 'Reload all sources or one source', request: { $ref: '#/components/schemas/SourceReloadInput' }, response: { oneOf: [{ $ref: '#/components/schemas/Source' }, { type: 'array', items: { $ref: '#/components/schemas/Source' } }] } }) }
    },
    '/sources/{id}/enable': {
      post: { tags: ['Sources'], ...op({ summary: 'Enable source', parameters: [sourceId], response: { $ref: '#/components/schemas/Source' } }) }
    },
    '/sources/{id}/disable': {
      post: { tags: ['Sources'], ...op({ summary: 'Disable source', parameters: [sourceId], response: { $ref: '#/components/schemas/Source' } }) }
    },
    '/sources/{id}/check-update': {
      post: { tags: ['Sources'], ...op({ summary: 'Check source update', parameters: [sourceId], response: { $ref: '#/components/schemas/SourceUpdateCheck' } }) }
    },
    '/music/search': {
      post: { tags: ['Music'], ...op({ summary: 'Search music by platform or all platforms', request: { $ref: '#/components/schemas/SearchInput' }, response: { $ref: '#/components/schemas/SearchResponse' } }) }
    },
    '/music/match': {
      post: { tags: ['Music'], ...op({ summary: 'Match a song across platforms', request: { $ref: '#/components/schemas/MatchInput' }, response: { $ref: '#/components/schemas/MatchResponse' } }) }
    },
    '/music/url': {
      post: {
        tags: ['Music'],
        ...op({
          summary: 'Resolve one or many music URLs',
          description: 'Specify source/platform and quality/type for one URL. Omit quality for all qualities sorted from low to high. Omit source for all matched platforms. provider/providerId selects one music source provider; omitting it tries all matching providers once. Business failures are returned in failures when multiple URLs are resolved.',
          request: { $ref: '#/components/schemas/MusicUrlInput' },
          response: { $ref: '#/components/schemas/MusicUrlMap' }
        })
      }
    },
    '/albums/detail': {
      post: { tags: ['Music'], ...op({ summary: 'Get album detail', request: { type: 'object', properties: { source: { type: 'string' }, albumId: { type: ['string', 'number'] }, songInfo: { $ref: '#/components/schemas/SongInfo' } } }, response: { type: 'object', additionalProperties: true } }) }
    },
    '/singers/detail': {
      post: { tags: ['Music'], ...op({ summary: 'Get singer detail', request: { type: 'object', properties: { source: { type: 'string' }, singerId: { type: ['string', 'number'] }, singer: { type: 'string' }, songInfo: { $ref: '#/components/schemas/SongInfo' } } }, response: { type: 'object', additionalProperties: true } }) }
    },
    '/music/detail': {
      post: { tags: ['Music'], ...op({ summary: 'Get music detail', request: { type: 'object', properties: { source: { type: 'string' }, songInfo: { $ref: '#/components/schemas/SongInfo' } } }, response: { type: 'object', additionalProperties: true } }) }
    },
    '/lyrics/get': {
      post: { tags: ['Lyrics'], ...op({ summary: 'Get lyric', request: { type: 'object', required: ['songInfo'], properties: { songInfo: { $ref: '#/components/schemas/SongInfo' } } }, response: { $ref: '#/components/schemas/LyricInfo' } }) }
    },
    '/lyrics/save': {
      post: { tags: ['Lyrics'], ...op({ summary: 'Save lyric files', request: { $ref: '#/components/schemas/LyricSaveInput' }, response: { $ref: '#/components/schemas/FileResult' } }) }
    },
    '/covers/get': {
      post: { tags: ['Covers'], ...op({ summary: 'Get cover URL', request: { type: 'object', required: ['songInfo'], properties: { songInfo: { $ref: '#/components/schemas/SongInfo' } } }, response: { $ref: '#/components/schemas/CoverResult' } }) }
    },
    '/covers/download': {
      post: { tags: ['Covers'], ...op({ summary: 'Download cover', request: { $ref: '#/components/schemas/CoverInput' }, response: { $ref: '#/components/schemas/CoverResult' } }) }
    },
    '/downloads': {
      get: { tags: ['Downloads'], ...op({ summary: 'List download tasks', response: { type: 'array', items: { $ref: '#/components/schemas/DownloadTask' } } }) },
      post: { tags: ['Downloads'], ...op({ summary: 'Create download task', request: { $ref: '#/components/schemas/DownloadInput' }, response: { $ref: '#/components/schemas/DownloadTask' } }) }
    },
    '/downloads/{id}': {
      get: { tags: ['Downloads'], ...op({ summary: 'Get download task', parameters: [taskId], response: { $ref: '#/components/schemas/DownloadTask' } }) }
    },
    '/downloads/{id}/pause': {
      post: { tags: ['Downloads'], ...op({ summary: 'Pause download task', parameters: [taskId], response: { $ref: '#/components/schemas/DownloadTask' } }) }
    },
    '/downloads/{id}/resume': {
      post: { tags: ['Downloads'], ...op({ summary: 'Resume download task', parameters: [taskId], response: { $ref: '#/components/schemas/DownloadTask' } }) }
    },
    '/downloads/{id}/cancel': {
      post: { tags: ['Downloads'], ...op({ summary: 'Cancel download task', parameters: [taskId], response: { $ref: '#/components/schemas/DownloadTask' } }) }
    },
    '/downloads/{id}/retry': {
      post: { tags: ['Downloads'], ...op({ summary: 'Retry download task', parameters: [taskId], response: { $ref: '#/components/schemas/DownloadTask' } }) }
    },
    '/metadata/embed': {
      post: { tags: ['Metadata'], ...op({ summary: 'Write metadata sidecar', request: { $ref: '#/components/schemas/MetadataEmbedInput' }, response: { $ref: '#/components/schemas/MetadataEmbedResult' } }) }
    }
  },
  components: {
    parameters: {
      SourceId: sourceId,
      TaskId: taskId
    },
    schemas
  }
};

export const apiDocsHtml = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>music-hub API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; background: #f7f8fa; }
    #swagger-ui { max-width: 1280px; margin: 0 auto; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({ url: '/openapi.json', dom_id: '#swagger-ui' });
  </script>
</body>
</html>`;
