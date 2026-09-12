# AGENTS.md

## Project

MCP server (stdio) exposing PocketBase operations as 24 tools, built on the MCP TypeScript SDK v2 and the PocketBase JS SDK. TypeScript ESM (`module: NodeNext`) compiled to `build/`. Requires Node >= 26 and pnpm 12 (enforced via `engines`/`devEngines`).

## Commands

- `pnpm install` — install dependencies
- `pnpm build` — `tsc` to `build/`; there is no linter/formatter, strict tsc is the only static check
- `pnpm dev` — `tsc -w`
- `pnpm test:unit` — build, then `node --test test/` (integration file auto-skips)
- `pnpm test:integration` — build, then live test against a managed PocketBase
- `pnpm test:all` — build, then all tests including integration
- `pnpm build && node --test test/registration.test.mjs` — run a single test file
- `pnpm exec fallow <dead-code|health|dupes|security|flags>` — static analysis (`fallow` is not on PATH)

## Testing

- Tests are plain `node:test` `.mjs` files and import the compiled `build/` output (or spawn `build/index.js`), so a build must happen first; the pnpm scripts already do this.
- Integration tests are opt-in: `RUN_INTEGRATION=1`. They download the latest PocketBase release (resolved from the GitHub releases API, sha256-verified) into `.cache/pocketbase` and run it on a free port. When the GitHub API is unreachable, the newest cached version is reused. `POCKETBASE_BIN` reuses an existing binary; setting `POCKETBASE_URL` + `POCKETBASE_ADMIN_EMAIL`/`POCKETBASE_ADMIN_PASSWORD` targets an external instance instead.
- `test/registration.test.mjs` asserts the exact tool list (`EXPECTED_TOOLS`), plus each tool's title, description, output schema, and read-only/destructive annotations. Update it when adding or removing tools.
- fallow `health` must report zero findings: with no measured coverage, CRAP = cyc²+cyc, so any function with cyclomatic complexity >= 5 is flagged. Extract helpers to keep functions at <= 4.

## Architecture

- `src/index.ts` — entrypoint; constructs the server, exports the error helpers, throws if `POCKETBASE_URL` is missing.
- `src/pocketbase-server.ts` — `PocketBaseServer` parses env config, builds `ToolContext` (`{ pb, authorizeAsAdmin }`), and calls `register*Tools(server, context)`.
- `src/tools/*.ts` — one `register*Tools` function per group (collections, records, auth, backup). Handlers return results through `src/tools/result.ts` helpers; `jsonResult` fills both `content` text and `structuredContent`.
- `src/tools/outputs.ts` — zod output schemas; they must match the `structuredContent` shapes the handlers return.
- `scripts/pocketbase-binary.mjs` — PocketBase binary download/cache helper, imported directly by tests. Plain JS on purpose: it lives outside tsconfig `rootDir` (`src`) and is not compiled.
- Auth tools share one PocketBase session per server process; collection management, backups, and impersonation require admin credentials.
- `src/errors.ts` flattens PocketBase validation errors; keep its exact message output stable, it is covered by characterization tests in `test/errors.test.mjs`.

## Conventions

- To add a tool: implement it in the matching `src/tools/*.ts`, add its output schema to `outputs.ts`, register it, and add the name to `EXPECTED_TOOLS` in `test/registration.test.mjs`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`).
- `.fallowrc.json` declares `test/*.test.mjs` as entry points; keep new test files matching `*.test.mjs`.
