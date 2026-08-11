import { app, ipcMain, nativeTheme } from 'electron'
import { IpcChannel, type AppSettings, type ThemeSource } from '@shared/ipc'
import { normalizeUiState } from '@shared/uiState'
import { getDatabase } from '../db'
import { getAppConfig, saveTheme, saveUiState, type AppConfig } from '../db/appConfig'

const platform = process.platform

const THEME_SOURCES: readonly ThemeSource[] = ['system', 'light', 'dark']

function isThemeSource(value: unknown): value is ThemeSource {
  return typeof value === 'string' && (THEME_SOURCES as readonly string[]).includes(value)
}

function toAppSettings(config: AppConfig): AppSettings {
  return {
    theme: config.theme,
    uiState: config.uiState,
    appVersion: app.getVersion(),
    platform
  }
}

export function registerConfigIpcHandlers(): void {
  ipcMain.handle(IpcChannel.ConfigGet, (): AppSettings => {
    return toAppSettings(getAppConfig(getDatabase()))
  })

  ipcMain.handle(IpcChannel.ConfigSetTheme, (_event, theme: unknown): AppSettings => {
    if (!isThemeSource(theme)) {
      throw new Error(`Unknown theme source: ${String(theme)}`)
    }

    const config = saveTheme(getDatabase(), theme)
    // Drives prefers-color-scheme in the renderer, and the title-bar overlay
    // colors via the nativeTheme 'updated' listener in src/main/index.ts.
    nativeTheme.themeSource = config.theme
    return toAppSettings(config)
  })

  // Unknown values are coerced to defaults rather than rejected: this is a
  // background write behind a debounce, so throwing would surface as an
  // unhandled rejection long after whatever caused it.
  ipcMain.handle(IpcChannel.ConfigSetUiState, (_event, uiState: unknown): AppSettings => {
    return toAppSettings(saveUiState(getDatabase(), normalizeUiState(uiState)))
  })
}
