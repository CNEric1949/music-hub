import { mcpInputSchemas } from '../api-schemas.js';

export const createTools = app => ({
  get_config: {
    description: 'Get runtime configuration.',
    inputSchema: mcpInputSchemas.get_config,
    handler: async () => app.configService.getPublic()
  },
  update_config: {
    description: 'Update runtime configuration for this process.',
    inputSchema: mcpInputSchemas.update_config,
    handler: async input => app.configService.update(input)
  },
  list_music_sources: {
    description: 'List music sources and capabilities.',
    inputSchema: mcpInputSchemas.list_music_sources,
    handler: async () => app.sourceManager.list()
  },
  get_music_source: {
    description: 'Get one music source.',
    inputSchema: mcpInputSchemas.get_music_source,
    handler: async ({ id }) => app.sourceManager.getPublic(id)
  },
  create_music_source: {
    description: 'Create a custom music source.',
    inputSchema: mcpInputSchemas.create_music_source,
    handler: async input => app.sourceManager.create(input)
  },
  update_music_source: {
    description: 'Update a custom music source.',
    inputSchema: mcpInputSchemas.update_music_source,
    handler: async ({ id, ...patch }) => app.sourceManager.update(id, patch)
  },
  delete_music_source: {
    description: 'Delete a custom music source.',
    inputSchema: mcpInputSchemas.delete_music_source,
    handler: async ({ id }) => app.sourceManager.delete(id)
  },
  reload_music_sources: {
    description: 'Reload music sources.',
    inputSchema: mcpInputSchemas.reload_music_sources,
    handler: async ({ id } = {}) => app.sourceManager.reload(id)
  },
  check_music_source_update: {
    description: 'Check source update.',
    inputSchema: mcpInputSchemas.check_music_source_update,
    handler: async ({ id }) => app.sourceManager.checkUpdate(id)
  },
  search_music: {
    description: 'Search music.',
    inputSchema: mcpInputSchemas.search_music,
    handler: async input => app.searchService.search(input)
  },
  match_music: {
    description: 'Match music across sources.',
    inputSchema: mcpInputSchemas.match_music,
    handler: async input => app.searchService.match(input)
  },
  get_music_url: {
    description: 'Resolve one or many music URLs. Omit quality for all qualities; omit source for all matched platforms.',
    inputSchema: mcpInputSchemas.get_music_url,
    handler: async input => app.mediaService.resolveMusicUrl(input)
  },
  get_album_detail: {
    description: 'Get album detail.',
    inputSchema: mcpInputSchemas.get_album_detail,
    handler: async input => app.mediaService.getAlbumDetail(input)
  },
  get_singer_detail: {
    description: 'Get singer detail.',
    inputSchema: mcpInputSchemas.get_singer_detail,
    handler: async input => app.mediaService.getSingerDetail(input)
  },
  get_music_detail: {
    description: 'Get music detail.',
    inputSchema: mcpInputSchemas.get_music_detail,
    handler: async input => app.mediaService.getMusicDetail(input)
  },
  get_lyric: {
    description: 'Get lyric.',
    inputSchema: mcpInputSchemas.get_lyric,
    handler: async ({ songInfo }) => app.mediaService.getLyric(songInfo)
  },
  get_cover: {
    description: 'Get cover URL.',
    inputSchema: mcpInputSchemas.get_cover,
    handler: async ({ songInfo }) => app.mediaService.getCover(songInfo)
  },
  create_download_task: {
    description: 'Create download task.',
    inputSchema: mcpInputSchemas.create_download_task,
    handler: async input => app.downloadService.create(input)
  },
  get_download_task: {
    description: 'Get download task.',
    inputSchema: mcpInputSchemas.get_download_task,
    handler: async ({ id }) => app.downloadService.get(id)
  },
  embed_music_metadata: {
    description: 'Embed metadata.',
    inputSchema: mcpInputSchemas.embed_music_metadata,
    handler: async input => app.metadataService.embed(input)
  }
});

export const listTools = tools => Object.entries(tools).map(([name, tool]) => ({
  name,
  description: tool.description,
  inputSchema: tool.inputSchema || { type: 'object' }
}));
