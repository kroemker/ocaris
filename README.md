# Ocaris

Local desktop hub for playing _The Legend of Zelda: Ocarina of Time_ mods. See [WORK_PACKAGES.md](./WORK_PACKAGES.md) for the project's work breakdown.

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
src/main            Electron main process (window, lifecycle)
src/main/db         SQLite connection, migrations, and per-entity DAOs
src/main/ipc        ipcMain handlers, one module per feature area
src/main/rom        ROM header verification (N64 header CRC1/CRC2 check)
src/main/emulator   Emulator executable-path validation
src/preload         contextBridge-exposed, typed API surface for the renderer
src/renderer   React app
src/shared     Types/constants shared between main and renderer (e.g. IPC contract)
tests/main     Unit tests for main-process modules
```

The SQLite database lives at `app.getPath('userData')/ocaris.db` (e.g. `~/.config/ocaris/ocaris.db` on Linux) and is created/migrated automatically on first launch.

## ROM verification

Ocaris checks a selected ROM's N64 header CRC1/CRC2 (bytes at offset `0x10`) against the known-good values for OoT 1.0 (U), rather than hashing the whole file. This only requires reading the first 24 bytes of the ROM (fast, no full-file I/O) and tolerates the file-format variance (trimmed/padded dumps) that a whole-file SHA-1/CRC32 would flag as different. The known-good header CRC values are sourced from [OoT-Randomizer's own input validation](https://github.com/OoTRandomizer/OoT-Randomizer/blob/Dev/Rom.py) (`valid_crc`), the most authoritative real-world reference for this exact check. See `src/main/rom/checksums.ts`.

A header CRC mismatch is a warning, not a hard block — the user can explicitly choose to proceed with an unverified ROM.
