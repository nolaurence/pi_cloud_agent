# Pi Cloud Agent Architecture

## Runtime Shape

The system is a three-package monorepo:

- `packages/backend`: NestJS API, MySQL persistence, JWT auth, user/session/browser connection ownership checks.
- `packages/sandbox`: NestJS sandbox adapter. It owns user workspaces, per-user Pi config folders, Pi RPC processes, browser CDP/extension bridge state.
- `packages/web`: React + Ant Design + Ant Design X UI.

The backend never executes Pi file tools or shell commands directly. A request path is:

1. Browser calls backend with a user JWT.
2. Backend checks ownership in MySQL.
3. Backend forwards the request to sandbox with `userId` and `sessionId`.
4. Sandbox ensures `data/sandbox/users/<userId>/workspace` and `data/sandbox/users/<userId>/pi-agent`.
5. Sandbox starts Pi in RPC mode with:
   - `cwd = user workspace`
   - `PI_CODING_AGENT_DIR = user pi-agent folder`
   - `PI_CODING_AGENT_SESSION_DIR = user pi-agent/sessions`
6. Pi built-in `read`, `write`, `edit`, and `bash` run from the isolated user workspace.

This makes user-level skills isolated too: each user has a dedicated `pi-agent/skills` directory.

## Browser Operations

Browser operations are represented as browser connection records and a Pi extension loaded by the sandbox. The implemented policy is:

- Prefer `user-extension` when the user provides a Playwright Extension token.
- Fall back to `sandbox-cdp`.
- Always set `newTabOnly: true`.

The sandbox package includes command construction points for Playwright MCP via CDP and Playwright CLI attach. Pi receives a `browser_cli` tool from `packages/sandbox/src/agent/pi-browser-extension.ts`; the tool runs sandbox-owned `playwright-cli` commands and blocks `tab-select`, so browser work starts with `tab-new` and does not take over existing user tabs.

## Database

TypeORM entities live in backend modules. The matching MySQL DDL is in `database/schema.sql`; `synchronize` is intentionally disabled so the schema is explicit and reviewable.

## Security Notes

- `browser_connections.token_ciphertext` is base64 in this scaffold. Replace it with envelope encryption before production.
- Backend-to-sandbox calls are local and unauthenticated in this scaffold. Put them on a private network and add service authentication before deployment.
- The sandbox currently isolates by directory and process environment. Use container, VM, or OS sandboxing for hostile workloads.
