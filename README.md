# music-hub
一个基于洛雪音乐源能力的服务端 API 项目，不提供 Web UI，首期目标支持 HTTP/MCP 协议。

项目参考原始项目 [lyswhut/lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) 的非 UI 能力，对音乐源、搜索、歌词、封面、下载和元数据处理进行服务端封装。ACP 协议支持列入 TODO。

感谢 [lyswhut](https://github.com/lyswhut) 及 [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) 项目长期沉淀的实现、协议设计和社区贡献。本项目会尽量遵循原始项目的使用边界与声明要求。

## 重要声明

- 本项目仅用于学习、研究与个人合法使用，不提供音乐资源，不提供音乐下载服务，不以任何方式盈利。
- 本项目不内置任何第三方音乐平台数据或资源，不承诺绕过版权限制。用户自行配置的音源、接口和使用行为，应由用户自行确认合法性并承担相应责任。
- 请在遵守所在地法律法规、平台服务条款和版权要求的前提下使用本项目。
- 本项目遵循原始项目 [lyswhut/lx-music-desktop](https://github.com/lyswhut/lx-music-desktop) 的相关声明与补充协议要求；如两者存在理解差异，请以原始项目声明的更严格约束为准。
- 本项目代码编写 100% Vibe Coding。

## 能力范围

首期聚焦：

- 音乐源管理：新增、删除、修改、查看、启用、禁用、重载、本地导入、在线导入。
- 音乐源状态：支持多音源同时初始化，返回初始化状态、能力、支持平台、支持音质和升级提示。
- 音乐搜索：支持指定平台搜索和全平台统一搜索。
- 音乐 URL：支持指定平台/全平台、指定音质/全部音质获取。
- 歌词与封面：支持获取、保存和下载后处理。
- 下载任务：支持创建、查询、暂停、恢复、取消、重试、断点续传和任务状态持久化。
- 元数据处理：按下载预设处理歌词、封面和基础元数据。
- 专辑、歌手、歌曲详情：支持的平台返回数据，不支持的平台返回明确业务码。
- HTTP 与 MCP 适配。

首期支持平台：

| 源 ID | 平台 |
| --- | --- |
| `kw` | 酷我音乐 |
| `kg` | 酷狗音乐 |
| `tx` | QQ 音乐 |
| `wy` | 网易云音乐 |
| `mg` | 咪咕音乐 |

`xm`、`bd` 不纳入支持范围。

不做的事情：

- 不做 Web UI、桌面播放器、本地音乐库扫描。
- 不做桌面歌词、媒体会话、播放状态同步。
- 歌单支持列入 TODO。
- 不执行音乐源自动升级或手动升级；只保留升级提示状态。

## TODO List

- [ ] 歌单支持，包括歌单详情、歌曲列表读取和必要的 HTTP/MCP 接口。
- [ ] 咪咕 `紅蓮華` LiSA 版本歌词补验。
- [ ] 咪咕封面搜索结果图片字段优先级确认。
- [ ] 接口鉴权。
- [ ] ACP 协议支持。
- [ ] 完整覆盖洛雪用户源工具 API，当前 `crypto/buffer/zlib` 仍是常用子集。

## 开发

需要 Node.js 24 或更高版本，源注册表与下载任务持久化使用运行时内置的 SQLite 支持。

```bash
npm test
npm run start:all
```

默认 HTTP 地址为 `http://127.0.0.1:3000`，MCP 地址为 `http://127.0.0.1:3100/mcp`。

HTTP API 文档地址为 `http://127.0.0.1:3000/api-docs`，OpenAPI JSON 地址为 `http://127.0.0.1:3000/openapi.json`。

MCP Tool 文档地址为 `http://127.0.0.1:3100/mcp/docs`，Tool JSON 地址为 `http://127.0.0.1:3100/mcp/tools`。MCP 标准客户端也可以通过 `tools/list` 获取带 `inputSchema` 的工具说明。

stdio 模式可通过 `npm run start:stdio` 启动，适用于需要由 MCP 客户端拉起本地进程的场景。

## Docker 部署

Docker 镜像默认同时启动 HTTP 与 MCP 服务，容器内端口固定为 `3000` 和 `3100`，运行数据挂载到宿主机 `./data`。

```bash
docker compose up -d --build
curl http://127.0.0.1:3000/health
```

如需调整宿主机端口：

```bash
MUSIC_HUB_HTTP_PUBLISHED_PORT=13000 MUSIC_HUB_MCP_PUBLISHED_PORT=13100 docker compose up -d --build
```

常用路径：

| 宿主机路径 | 容器路径 | 说明 |
| --- | --- | --- |
| `./data/music-hub.sqlite` | `/app/data/music-hub.sqlite` | SQLite 状态库 |
| `./data/sources/*.js` | `/app/data/sources/*.js` | 本地音源脚本 |
| `./data/downloads` | `/app/data/downloads` | 下载文件 |
| `./data/logs` | `/app/data/logs` | 日志文件 |

## 配置与日志

默认配置见 `config.example.json`。运行时会自动扫描 `data/sources/*.js` 加载 LX 用户源脚本。

日志默认写入 `data/logs/music-hub.log`，可通过 `MUSIC_HUB_LOGS_DIR` 调整日志目录。下载目录默认是 `data/downloads`，可通过 `MUSIC_HUB_DOWNLOAD_DIR` 调整。

源注册表和下载任务状态默认写入 `data/music-hub.sqlite`。音乐源导入入口包括启动时扫描 `data/sources/*.js`、用户上传文件导入和 URL 在线导入；脚本文件仍保存在 `data/sources/*.js`。

配置加载顺序：默认值 < 配置文件 < 环境变量。

常用环境变量：

| 环境变量 | 说明 |
| --- | --- |
| `MUSIC_HUB_CONFIG` | 配置文件路径 |
| `MUSIC_HUB_HOST` | HTTP 服务监听地址 |
| `MUSIC_HUB_PORT` | HTTP 服务端口 |
| `MUSIC_HUB_MCP_HOST` | MCP 服务监听地址 |
| `MUSIC_HUB_MCP_PORT` | MCP 服务端口 |
| `MUSIC_HUB_DATA_DIR` | 数据目录 |
| `MUSIC_HUB_SOURCES_DIR` | 音源脚本目录 |
| `MUSIC_HUB_DOWNLOAD_DIR` | 下载目录 |
| `MUSIC_HUB_CACHE_DIR` | 缓存目录 |
| `MUSIC_HUB_LOGS_DIR` | 日志目录 |
| `MUSIC_HUB_SOURCES_MULTI_ENABLED` | 是否同时初始化多个自定义音源，默认 `true` |
| `MUSIC_HUB_DOWNLOAD_QUALITY` | 下载默认音质，默认 `320k` |
| `MUSIC_HUB_DOWNLOAD_QUALITY_STRATEGY` | 下载音质策略：`specified`、`highest`、`lowest` |
| `MUSIC_HUB_DOWNLOAD_SOURCE_STRATEGY` | 下载音源策略：`specified`、`all` |
| `MUSIC_HUB_DOWNLOAD_RETRY_COUNT` | 下载失败自动重试次数，默认 `3` |
| `MUSIC_HUB_DOWNLOAD_RETRY_INTERVAL_MS` | 下载失败自动重试间隔毫秒数，默认 `5000` |

运行期可以通过 `GET /config` 查询当前配置，通过 `PATCH /config` 更新 `sources.multiSourceEnabled` 和下载相关策略。下载任务创建时默认使用当前配置快照，也可以通过 `quality/type`、`source/platform`、`provider/providerId/sourceId`、`qualityStrategy`、`sourceStrategy`、`retryCount`、`retryIntervalMs` 覆盖单个任务。

## HTTP API

HTTP API 默认监听 `MUSIC_HUB_HOST`/`MUSIC_HUB_PORT`。

```bash
npm run start:http
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3000/sources
```

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 健康检查 |
| `GET` | `/config` | 查询运行配置 |
| `PATCH` | `/config` | 更新运行配置中的音源/下载策略 |
| `GET` | `/sources` | 音源列表 |
| `POST` | `/sources` | 新增音源，支持 `code`、`filePath`、`url` |
| `GET` | `/sources/:id` | 查询单个音源 |
| `PATCH` | `/sources/:id` | 修改音源配置 |
| `DELETE` | `/sources/:id` | 删除音源 |
| `POST` | `/sources/reload` | 重载音源 |
| `POST` | `/sources/:id/enable` | 启用音源 |
| `POST` | `/sources/:id/disable` | 禁用音源 |
| `POST` | `/sources/:id/check-update` | 查询音源升级提示状态 |
| `POST` | `/music/search` | 搜索歌曲 |
| `POST` | `/music/match` | 跨源匹配歌曲 |
| `POST` | `/music/url` | 获取音乐 URL；不指定平台时尝试所有平台，不指定音质时按低到高返回所有可用音质 |
| `POST` | `/albums/detail` | 获取专辑详情 |
| `POST` | `/singers/detail` | 获取歌手详情 |
| `POST` | `/music/detail` | 获取歌曲详情 |
| `POST` | `/lyrics/get` | 获取歌词 |
| `POST` | `/lyrics/save` | 保存歌词文件 |
| `POST` | `/covers/get` | 获取封面 URL |
| `POST` | `/covers/download` | 下载封面文件 |
| `POST` | `/downloads` | 创建下载任务 |
| `GET` | `/downloads` | 查询任务列表 |
| `GET` | `/downloads/:id` | 查询任务状态 |
| `POST` | `/downloads/:id/pause` | 暂停任务 |
| `POST` | `/downloads/:id/resume` | 恢复任务 |
| `POST` | `/downloads/:id/cancel` | 取消任务 |
| `DELETE` | `/downloads/:id` | 删除任务记录 |
| `POST` | `/downloads/:id/retry` | 重试任务 |
| `POST` | `/metadata/embed` | 对已有文件嵌入歌词/封面 |
| `GET` | `/api-docs` | Swagger UI API 文档 |
| `GET` | `/openapi.json` | OpenAPI JSON |

暂时不做接口鉴权，鉴权列入 TODO。

## MCP Tools

MCP 默认监听 `MUSIC_HUB_MCP_HOST`/`MUSIC_HUB_MCP_PORT`，使用官方 MCP SDK 实现标准协议握手、能力协商和 Tool 调用。服务端支持三种接入方式：

| 方式 | 入口 | 说明 |
| --- | --- | --- |
| Streamable HTTP | `http://127.0.0.1:3100/mcp` | 推荐的远程 MCP 传输，客户端会先发送 `initialize`，后续请求携带 `Mcp-Session-Id`。 |
| SSE 兼容 | `http://127.0.0.1:3100/mcp` 或 `http://127.0.0.1:3100/sse` | 兼容仍使用 HTTP+SSE 的 MCP 客户端；消息 POST 入口由 SSE `endpoint` 事件返回。 |
| stdio | `npm run start:stdio` | 适用于由 MCP 客户端启动本地进程的配置，日志写入 stderr，避免污染 stdout 协议流。 |

Trae 等使用 SSE URL 的客户端可以配置：

```json
{
  "url": "http://127.0.0.1:3100/mcp",
  "type": "sse"
}
```

stdio 客户端可以配置：

```json
{
  "command": "npm",
  "args": ["run", "start:stdio"],
  "cwd": "/root/workspace/private/lx-music-hub/music-hub"
}
```

客户端初始化后可使用标准 MCP 方法：

- `tools/list`
- `tools/call`

当前 Tools：

| Tool | 说明 |
| --- | --- |
| `get_config` | 查询运行配置 |
| `update_config` | 更新运行配置中的音源/下载策略 |
| `list_music_sources` | 列出音源及能力 |
| `get_music_source` | 查询单个音源 |
| `create_music_source` | 新增音源 |
| `update_music_source` | 修改音源 |
| `delete_music_source` | 删除音源 |
| `enable_music_source` | 启用音源 |
| `disable_music_source` | 禁用音源 |
| `reload_music_sources` | 重载音源 |
| `check_music_source_update` | 查询音源升级提示状态 |
| `search_music` | 搜索音乐 |
| `match_music` | 跨源匹配歌曲 |
| `get_music_url` | 获取歌曲 URL，支持单音质、多音质、指定平台、全平台 |
| `get_album_detail` | 获取专辑详情 |
| `get_singer_detail` | 获取歌手详情 |
| `get_music_detail` | 获取歌曲详情 |
| `get_lyric` | 获取歌词 |
| `get_cover` | 获取封面 URL |
| `create_download_task` | 创建下载任务 |
| `get_download_task` | 查询下载任务状态 |
| `embed_music_metadata` | 嵌入歌词/封面 |

MCP 接口说明以 `tools/list` 返回的 `description` 与 `inputSchema` 为准。MCP 服务同时提供便于人工查看的 `GET /mcp/tools` JSON 与 `GET /mcp/docs` HTML 页面；这不是 MCP 协议标准要求，但便于调试。

## 错误结构

错误响应使用统一结构：

```json
{
  "ok": false,
  "error": {
    "code": "SOURCE_CAPABILITY_UNSUPPORTED",
    "message": "Source does not support capability: album",
    "details": {}
  }
}
```

当前错误码覆盖：

- `SOURCE_NOT_FOUND`
- `SOURCE_DISABLED`
- `SOURCE_CAPABILITY_UNSUPPORTED`
- `SOURCE_UPDATE_FAILED`
- `SOURCE_SCRIPT_ERROR`
- `MUSIC_NOT_FOUND`
- `QUALITY_UNSUPPORTED`
- `DOWNLOAD_TASK_NOT_FOUND`
- `DOWNLOAD_PATH_INVALID`
- `DOWNLOAD_RESUME_FAILED`
- `METADATA_EMBED_FAILED`
- `VALIDATION_ERROR`

## 合规说明

- 本项目仅用于学习、研究与个人合法使用。
- 调用第三方音乐平台接口时应遵守对应平台服务条款与版权要求。
- 项目不内置侵权内容，不承诺绕过版权限制。
- 自定义音源由用户自行配置，项目提供安全边界和免责声明。
- 下载能力应结合鉴权、网络边界和用户配置谨慎开放，避免被滥用。

## 实现与验证跟踪

状态说明：`已实现` 表示已有代码路径和接口；`部分实现` 表示有基础能力但未达到需求完整语义；`未实现` 表示目前没有可用实现。验证状态以当前自动化测试和本地真实音源验证为准。

当前测试使用真实 LX 用户源文件进行验证。真实搜索验证歌曲：`紅蓮華`。

| 功能/需求 | HTTP API | MCP Tool | 实现情况 | 验证情况 | 备注/缺口 |
| --- | --- | --- | --- | --- | --- |
| 健康检查 | `GET /health` | 无 | 已实现 | 已验证 | 已通过 HTTP handler 和真实监听端口请求验证。 |
| 音乐源列表与能力查询 | `GET /sources` | `list_music_sources` | 已实现 | 已验证 | 已验证真实 LX 用户源自动加载，并输出支持平台与音质。 |
| 单个音乐源查询 | `GET /sources/:id` | `get_music_source` | 已实现 | 已验证 | 已验证 HTTP 与 MCP 查询真实音源详情。 |
| 自定义音乐源自动发现 | 无独立 API | 无独立 Tool | 已实现 | 已验证 | 启动时扫描 `data/sources/*.js`，当前验证两个真实 LX 用户源文件。 |
| 自定义音乐源 LX 协议兼容 | 通过源管理/媒体 API 间接使用 | 通过源管理/媒体 Tool 间接使用 | 部分实现 | 部分验证 | 已支持并验证 `lx.request/on/send`、`EVENT_NAMES.inited/request/updateAlert`、脚本元信息、平台/音质/action 识别、`search/musicUrl/lyric/pic/album/singer/musicDetail` action 转发和基础归一化；`crypto/buffer/zlib` 仍是常用子集，未覆盖全部洛雪工具 API。 |
| 音乐源新增 | `POST /sources` | `create_music_source` | 已实现 | 已验证 | 支持 `code`、`filePath`、`url` 三种导入；已验证本地上传式导入和在线 URL 导入。 |
| 音乐源修改 | `PATCH /sources/:id` | `update_music_source` | 已实现 | 已验证 | 支持更新配置，也支持用 `code/filePath/url` 覆盖脚本。 |
| 音乐源删除 | `DELETE /sources/:id` | `delete_music_source` | 已实现 | 已验证 | 删除后从运行列表、注册表和音源目录移除；不保留历史版本，不提供回滚。 |
| 音乐源启用/禁用 | `POST /sources/:id/enable`, `POST /sources/:id/disable` | `enable_music_source`, `disable_music_source` | 已实现 | 已验证 | 已验证 HTTP 与 MCP 启用/禁用真实音源。 |
| 音乐源注册表持久化 | 源管理 API | 源管理 Tool | 已实现 | 已验证 | 自定义音源注册表已存储到 `data/music-hub.sqlite`；导入入口只包括目录扫描、用户上传文件和 URL 在线导入，脚本文件继续保存在 `data/sources/*.js`。 |
| 音乐源重载 | `POST /sources/reload` | `reload_music_sources` | 已实现 | 已验证 | 已验证 HTTP 与 MCP 重载真实音源。 |
| 音乐源升级提示 | `GET /sources`, `GET /sources/:id`, `POST /sources/:id/check-update` | `check_music_source_update` | 已实现 | 已验证 | 不执行升级；捕获 LX `updateAlert`，返回是否可升级、提示文案、更新 URL 等信息。 |
| 多音源同时初始化 | 配置项 | 无 | 已实现 | 已验证 | `sources.multiSourceEnabled` 默认 `true`；关闭时只初始化一个自定义音源，其余为 `inactive`。 |
| 指定平台音乐搜索 | `POST /music/search` | `search_music` | 已实现 | 已验证 | 已用真实歌曲 `紅蓮華` 分别验证 `kg/kw/mg/tx/wy` 搜索成功；QQ 音乐搜索失败时使用保守指数退避，最多重试 3 次，单次退避不超过 30 秒。 |
| 全平台统一搜索 | `POST /music/search` with `source: "all"` | `search_music` | 已实现 | 已验证 | 已验证 HTTP 全平台聚合包含 `kg/kw/mg/tx/wy`；MCP 已验证指定平台搜索。 |
| 搜索分页/limit | `POST /music/search` | `search_music` | 已实现 | 已验证 | 已验证真实源 `page=1/page=2` 与 `limit` 返回值，MCP 指定分页也已覆盖。 |
| 搜索失败隔离 | `POST /music/search` | `search_music` | 已实现 | 已验证 | 已构造一个成功源和一个失败源，验证成功结果仍返回，失败源进入 `failures`。 |
| 跨源匹配 | `POST /music/match` | `match_music` | 已实现 | 已验证 | 已用真实搜索结果验证 HTTP 匹配接口返回候选列表。 |
| 运行配置查询/更新 | `GET /config`, `PATCH /config` | `get_config`, `update_config` | 已实现 | 已验证 | 支持查询当前配置，并更新多音源初始化开关、下载默认音质、下载音质策略、下载音源策略和下载后处理选项。 |
| 获取音乐 URL | `POST /music/url` | `get_music_url` | 已实现 | 已验证 | 合并单音质/多音质/跨平台解析；指定 `source/platform` 与 `quality/type` 时返回单 URL；不指定音质时按 `128k` 到 `master` 低到高返回；不指定 provider 时尝试所有匹配音源一次，不做 URL 缓存、过期或可用性探测；质量不可用返回 `QUALITY_UNSUPPORTED`；多 URL 响应包含 `failures` 明细。 |
| 本地源 `local` URL 语义 | `POST /music/url` | `get_music_url` | 已实现 | 已验证 | 兼容 LX 用户源 `local` 平台，URL 结果允许 `type: null`。 |
| 指定源/全源下载策略 | `GET/PATCH /config`, `POST /downloads` | `get_config`, `update_config`, `create_download_task` | 已实现 | 已验证 | 支持配置默认值，也支持任务级 `source/platform/provider/sourceStrategy` 覆盖；已验证指定平台、指定解析源、不指定平台和 `sourceStrategy: all` 入任务。 |
| 下载品质策略 | `GET/PATCH /config`, `POST /downloads` | `get_config`, `update_config`, `create_download_task` | 已实现 | 已验证 | 支持 `qualityStrategy: specified/highest/lowest` 和任务级 `quality/type` 覆盖；已验证指定 `128k`、不指定品质使用默认 `320k`、`highest` 从可用音质中选择 `320k`。 |
| 下载任务创建 | `POST /downloads` | `create_download_task` | 已实现 | 已验证 | 已验证 HTTP 和 MCP 创建等待状态任务。 |
| 下载任务列表 | `GET /downloads` | 无 | 已实现 | 已验证 | 已验证 HTTP 列表；MCP 未暴露列表 Tool。 |
| 下载任务详情 | `GET /downloads/:id` | `get_download_task` | 已实现 | 已验证 | 已验证 HTTP 与 MCP 任务详情。 |
| 下载任务暂停 | `POST /downloads/:id/pause` | 无 | 已实现 | 已验证 | 已验证 HTTP 暂停等待任务；MCP 未暴露 pause Tool。 |
| 下载任务恢复/断点续传 | `POST /downloads/:id/resume` | 无 | 已实现 | 已验证 | 已用本地 `file:` URL 和本地 HTTP Range 服务验证断点续写完成；异常重启后任务会按配置恢复为 paused，需手动 resume。 |
| 下载任务取消/删除 | `POST /downloads/:id/cancel`, `DELETE /downloads/:id` | 无 | 已实现 | 已验证 | 已验证 HTTP 取消任务和删除任务记录；MCP 未暴露 cancel/delete Tool。 |
| 下载任务重试 | `POST /downloads/:id/retry` | 无 | 已实现 | 已验证 | 支持失败自动重试，`retryCount` 默认 `3`、`retryIntervalMs` 默认 `5000`；已用本地 HTTP 服务验证前两次失败后自动重试成功，并验证手动 retry 会重置尝试次数。MCP 未暴露 retry Tool。 |
| 下载任务持久化 | `GET/POST /downloads` | `create_download_task`, `get_download_task` | 已实现 | 已验证 | 下载任务已存储到 `data/music-hub.sqlite`；服务重启后非终态任务按配置恢复为 paused。 |
| 下载目录配置 | 配置/环境变量 | 无 | 已实现 | 已验证 | 测试通过 `MUSIC_HUB_DOWNLOAD_DIR` 指向临时目录并完成下载。 |
| 日志落盘 | 配置/环境变量 | 无 | 已实现 | 已验证 | 默认 `data/logs/music-hub.log`，测试使用 `MUSIC_HUB_LOGS_DIR`。 |
| 歌词获取 | `POST /lyrics/get` | `get_lyric` | 已实现 | 已验证主要平台 | 内置源优先使用 `smart-lyric` 支持的歌词下载/解析能力，失败后回退到平台协议实现；已用 `紅蓮華` 验证 `tx/wy/kg` 返回普通、翻译、罗马音和逐字歌词，`kw` 返回普通、翻译和逐字歌词；咪咕使用 MRC/LRC/TRC 回退实现，但 `紅蓮華` 在咪咕搜索未稳定命中 LiSA 版本，仍需单独歌曲补验。 |
| 歌词保存 | `POST /lyrics/save` | 无 | 已实现 | 已验证 | 已验证独立保存接口写入主 `.lrc`，并在 `saveAll` 时保存翻译、罗马音和 LX 逐字歌词变体。 |
| 歌词合并策略 | 下载完成后配置驱动 | 无 | 已实现 | 已验证 | 已验证普通歌词合并翻译、罗马音，并在开启 `mergeLxLyric` 时生成 LX `[awlrc:...]` 合并段。 |
| 封面 URL 获取 | `POST /covers/get` | `get_cover` | 已实现主要平台 | 已验证主要路径 | 内置源按“歌曲/资源封面优先，专辑/搜索结果封面兜底”获取，并返回 `sourceType/provider/fallback`；自定义 LX 源转发 `pic` action 并归一化 `url/pic/img/cover`。 |
| 封面下载 | `POST /covers/download` | 无 | 已实现 | 已验证真实下载 | 支持按传入 URL 或 `/covers/get` 结果下载到下载目录，并按 Content-Type/URL 推断扩展名；已用 `紅蓮華` 验证内置 QQ 真实封面下载落盘。 |
| 下载后歌词/封面处理 | 下载任务配置 | 无 | 已实现 | 已验证 | 下载完成后可保存歌词、各类歌词变体、下载封面并写入音频标签；已用本地 HTTP 音频结合真实 QQ `紅蓮華` 歌词/封面验证端到端处理。 |
| 元数据嵌入 | `POST /metadata/embed` | `embed_music_metadata` | 已实现 | 已验证 | 已验证 MP3 写入 ID3 标题、艺术家、专辑、歌词和封面，FLAC 写入 Vorbis Comment 与 Picture block；不再生成 `.music-hub-meta.json` sidecar。 |
| 专辑详情 | `POST /albums/detail` | `get_album_detail` | 已实现 | 已验证 | 已验证 LX 用户源 `album` action 转发，并使用真实 `紅蓮華` 搜索结果验证真实平台详情返回。 |
| 歌手详情 | `POST /singers/detail` | `get_singer_detail` | 已实现 | 已验证 | 已验证 LX 用户源 `singer` action 转发，并使用真实 `紅蓮華` 搜索结果验证真实平台详情返回。 |
| 歌曲详情 | `POST /music/detail` | `get_music_detail` | 已实现 | 已验证 | 已验证 LX 用户源 `musicDetail` action 转发，并使用真实 `紅蓮華` 搜索结果验证真实平台详情返回。 |
| 不支持能力业务码 | 多个 API | 多个 Tool | 已实现 | 已验证 | 已验证 HTTP 在不支持平台专辑详情时返回 `SOURCE_CAPABILITY_UNSUPPORTED`。 |
| HTTP API 服务 | 所有 HTTP 路由 | 不适用 | 已实现 | 已验证 | 已通过 handler 自动化验证，并通过真实监听端口请求验证 `/health` 与 `/openapi.json`。 |
| HTTP API 文档 | `GET /api-docs`, `GET /openapi.json` | 无 | 已实现 | 已验证 | `/api-docs` 提供 Swagger UI，OpenAPI JSON 包含主要入参、返回值、错误结构和字段说明；Swagger UI 静态资源依赖 CDN。 |
| MCP 服务 | 不适用 | `tools/list`, `tools/call` | 已实现 | 已验证 | 已用官方 MCP SDK Client 验证真实监听端口上的 Streamable HTTP `/mcp` 与 SSE `/mcp` 连接、初始化和 `tools/list`。 |
| MCP Tool 文档 | 不适用 | `GET /mcp/tools`, `GET /mcp/docs` | 已实现 | 已验证 | 仅 MCP 服务端口提供 MCP Tool JSON 和简易 HTML 文档页；这两个调试端点不是 MCP 标准协议入口。 |
| MCP 音源 CRUD | 不适用 | `list/get/create/update/delete/enable/disable/reload/check_music_source_update` | 已实现 | 已验证 | 已验证 list/get/update/delete/enable/disable/reload/check。 |
| 鉴权 | 无 | 无 | 未实现 | 未验证 | 按需求列入 TODO。 |
| ACP 协议 | 无 | 无 | 未实现 | 未验证 | 按需求列入 TODO。 |
| Docker 部署适配 | 配置/环境变量 | 无 | 已实现 | 已验证 | 提供 `Dockerfile` 与 `docker-compose.yml`，挂载 `./data` 持久化 SQLite、音源脚本、下载和日志；已验证镜像构建、compose 配置和容器健康检查。 |

### 当前自动化验证

```bash
npm test
npm run check
```

`npm test` 当前覆盖：

- 自动加载 `data/sources/*.js` 中的真实 LX 用户源。
- 按功能拆分测试文件：`test/sources.test.js`、`test/lx-protocol.test.js`、`test/music.test.js`、`test/downloads.test.js`、`test/lyrics.test.js`、`test/search.test.js`、`test/docs.test.js`、`test/metadata.test.js`、`test/health.test.js`、`test/server-listen.test.js`。
- 输出真实音源支持的平台和音质。
- 使用真实歌曲名 `紅蓮華` 分别搜索 `kg/kw/mg/tx/wy`。
- 验证 QQ 音乐搜索保守指数退避计算：`5s/10s/20s`，最多重试 3 次，单次退避不超过 30 秒。
- 手动验证内置源 `紅蓮華` 歌词链路：`tx/wy/kg` 获取普通、翻译、罗马音、逐字歌词；`kw` 获取普通、翻译、逐字歌词。
- 验证 HTTP handler 的健康检查、运行配置、音源列表/详情/启用/禁用/重载/升级提示、搜索、搜索失败隔离、匹配、合并后的音乐 URL、下载任务、歌词、封面、元数据、API 文档和不支持能力业务码。
- 验证 MCP 标准初始化和 `Mcp-Session-Id` 会话调用下的 `tools/list`、运行配置、音源查询/列表/更新/删除/启用/禁用/重载/升级检查、搜索、音乐 URL、多音质 URL、创建下载任务、下载任务详情。
- 验证 HTTP/MCP 服务真实监听端口后的网络请求，包括 HTTP `/health`、`/openapi.json`，以及官方 MCP SDK Client 通过 Streamable HTTP `/mcp` 和 SSE `/mcp` 获取 `tools/list`。
- 验证音乐源目录扫描、本地导入、在线导入、多音源同时初始化、单音源初始化模式、源注册表 SQLite 落盘，以及可升级源的升级提示信息。
- 验证 LX 用户源协议 fixture 的 `lx.request`、初始化事件、升级提示、action 转发、详情能力和基础返回结构归一化。
- 验证 MCP `tools/list` 的 `inputSchema`、`/mcp/tools` Tool JSON 和 `/mcp/docs` 文档页。
- 使用本地 `file:` 音频文件验证下载任务断点续写完成、下载目录环境变量、下载后歌词文件落盘，且不再生成 `.music-hub-meta.json`。
- 验证下载任务写入 SQLite。
- 使用独立歌词保存接口验证主歌词、翻译歌词、罗马音歌词、LX 逐字歌词变体和 `[awlrc:...]` 合并内容。
- 使用本地 HTTP 音频、歌词和封面源验证下载任务完成后自动写入 MP3 音频标签。
- 使用最小 MP3/FLAC fixture 验证真实音频标签写入，包括歌词和封面。
- 使用本地 HTTP Range 服务验证真实网络下载、断点续传、失败自动重试、任务删除、下载目录配置，以及指定/不指定平台、解析源和品质的组合下载。
- 封面相关自动化验证 `/covers/get` 响应字段、LX fixture `pic` action 转发、下载后处理容错路径，以及内置 QQ 对 `紅蓮華` 的真实封面 URL 获取和图片下载落盘。
- 使用本地 HTTP 音频结合真实 QQ `紅蓮華` 歌词和封面，验证下载任务完成后保存歌词、下载封面并写入 MP3 `USLT/APIC` 标签。

由于测试依赖真实外部音源与音乐平台接口，离线环境或 DNS 受限环境可能失败或跳过。

## 封面语义摸底

当前代码实现：

- `/covers/get` 由 `MediaService.getCover` 选择具备 `cover` 能力的 provider，再返回 `{ url, sourceType, provider, fallback }` 等信息。
- 内置源 `getCover` 优先尝试歌曲或资源封面；失败后回退到专辑封面或搜索结果中的 `songInfo.img`。
- 自定义普通源支持 `getCover` 或 `getPic`；LX 用户源通过 `pic` action 获取封面，并将 `url/pic/img/cover` 归一化为 URL。
- `/covers/download` 复用 `/covers/get` 结果完成真实图片下载；下载后处理会尝试封面下载，失败只记录 warning，不阻断任务完成。

原始项目封面来源摸底：

| 平台 | 原始项目获取方式 | 封面语义判断 | 备注 |
| --- | --- | --- | --- |
| `tx` QQ 音乐 | `T002R500x500M000${albumId}.jpg` | 专辑封面 | 搜索结果在专辑为空时可能用歌手图 `T001` 兜底，但 `getPic` 主路径按 `albumId` 取专辑图。 |
| `wy` 网易云音乐 | 歌曲详情 `info.al.picUrl` | 专辑封面 | `al` 是歌曲所属专辑信息。 |
| `kw` 酷我音乐 | `artistpicserver.kuwo.cn/pic.web?...type=rid_pic&rid=${songmid}` | 歌曲/资源封面 | 按歌曲 rid 获取，不是按 albumId 获取。 |
| `kg` 酷狗音乐 | `get_res_privilege`，传 `album_audio_id`、`album_id`、`hash` 后取 `info.image` | 歌曲资源封面，带专辑参数 | 结果由资源权限接口返回，不能简单等同于纯专辑封面。 |
| `mg` 咪咕音乐 | `getSongPic?songId=${songId}`，返回 `largePic/mediumPic/smallPic` | 歌曲封面 | 搜索结果也会带 `img1/img2/img3` 或专辑图片字段，后续实现需明确优先级。 |

封面获取策略：优先尝试歌曲或资源封面；如果平台不提供或请求失败，再回退到专辑封面或搜索结果已有图片。返回结果中的 `sourceType` 用于标识实际来源语义，例如 `song`、`album`、`resource` 或 `custom`。
