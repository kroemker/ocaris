# Ocaris

Local desktop hub for playing *The Legend of Zelda: Ocarina of Time* mods. See [WORK_PACKAGES.md](./WORK_PACKAGES.md) for the project's work breakdown.

## Stack

Electron + React + TypeScript (via `electron-vite`), `better-sqlite3` for local storage.

## Development

```sh
npm install
npm run dev        # start the app with hot reload
npm run build       # production build to out/
npm run typecheck   # tsc --noEmit for main/preload and renderer
npm run lint         # eslint
npm run format       # prettier --write
npm run test         # vitest
```

## Project layout

```
src/main       Electron main process (window, SQLite, IPC handlers)
src/preload    contextBridge-exposed, typed API surface for the renderer
src/renderer   React app
src/shared     Types/constants shared between main and renderer (e.g. IPC contract)
tests/main     Unit tests for main-process modules
```

The SQLite database lives at `app.getPath('userData')/ocaris.db` (e.g. `~/.config/ocaris/ocaris.db` on Linux) and is created/migrated automatically on first launch.
