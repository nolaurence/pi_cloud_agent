# Pi Cloud Agent

Cloud agent scaffold using [`@earendil-works/pi-coding-agent`](https://github.com/earendil-works/pi), NestJS, MySQL, React, Ant Design, and Ant Design X.

## What Is Implemented

- Two backend layers: API backend plus sandbox service.
- Pi RPC process runs in sandbox, not backend.
- User-isolated workspace and user-isolated Pi config/skills folders.
- NestJS backend with TypeORM entities and MySQL DDL.
- React frontend using only Ant Design and Ant Design X base components.
- Zinc-like dark theme.
- Browser connection page that detects a Playwright extension ping, accepts an extension token, prefers user browser mode, and marks connections as new-tab-only.

## Quick Start

```bash
npm install
cp .env.example .env
mysql < database/schema.sql
npm run dev
```

Open `http://localhost:5173`.

## Services

- Web: `http://localhost:5173`
- Backend API: `http://localhost:3000/api`
- Sandbox: `http://localhost:3001`

## Notes

The sandbox service starts Pi in RPC mode with `cwd` set to the user's workspace and `PI_CODING_AGENT_DIR` set to that user's private Pi folder. That is the bridge that keeps Pi file operations, shell operations, sessions, and skills out of the API backend and separated per user.
