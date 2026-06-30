# AGENTS.md

## Project Context

`music-hub` exposes non-UI music capabilities through HTTP and MCP APIs. It must not implement a Web UI.

Local-only analysis notes, if any, belong outside this repository or under an ignored local notes directory. They must not replace project documentation under `docs/`.

## Working Rules

- Keep implementation in ESM JavaScript unless the project later explicitly adopts TypeScript.
- Do not add frontend UI, landing pages, or browser-focused workflows.
- Prefer a shared core service layer that is reused by HTTP and MCP adapters.
- Keep documentation in `docs/` current when behavior or public APIs change.
- Treat source APIs as unstable: isolate per-source failures and return partial results where appropriate.
- Avoid copying browser or desktop-client assumptions; replace UI, IPC, and local client-store dependencies with server-side services/configuration.
- Keep filesystem-writing features constrained by configuration and validate paths before writing.

## Expected Core Domains

- Music source management, including custom source loading.
- Music source CRUD, enable/disable, reload, update checks, manual upgrades, and configurable automatic upgrades.
- Music search and cross-source matching.
- Album, singer, and music-detail APIs where supported by each platform, with explicit capability-unsupported errors where not supported.
- Lyric retrieval and lyric file generation.
- Cover retrieval and optional cover download.
- Music URL resolution.
- Download tasks with status/control APIs, persisted state, resume after restart, and resumable transfers after abnormal exits.
- MP3/FLAC lyric and cover embedding.
- HTTP and MCP protocol adapters.

## Documentation And Tests

- Keep the README accurate for setup, usage, and legal/disclaimer notes.
- Add or update tests for core parsing, normalization, source management, and API contracts when behavior changes.
- Use structured errors and avoid leaking raw stack traces through public APIs.
- Do not commit generated downloads, caches, secrets, logs, or local source scripts unless they are intentional fixtures.
- Keep dependency choices conservative and documented, especially for sandboxing, metadata writing, and MCP support.

## Git And Commit Rules

- Keep commit and push as separate steps unless the user explicitly asks to push.
- Before committing, inspect the staged diff and write a specific commit message from the actual changes.
- Do not use vague subjects such as "update files", "enhance APIs", or "fix issues" when a more concrete description is available.
- The commit subject should name the main feature, behavior change, or bug fix.
- The commit body should explain, when applicable:
  - Added: new APIs, commands, config fields, tests, docs, or user-visible behavior.
  - Changed: modified behavior, refactors with behavior impact, defaults, validation, or contracts.
  - Removed: deleted APIs, options, files, behavior, or dependencies.
  - Fixed: the concrete problem solved and why the previous behavior was wrong.
  - Tests: commands run and important results.
- If the change spans multiple areas, use concise bullets in the body instead of hiding everything behind one generic summary.
- If the user asks for a local commit only, stop after the commit and report that it has not been pushed.
