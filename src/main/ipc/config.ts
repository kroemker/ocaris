import { app, ipcMain, nativeTheme } from 'electron'
import { IpcChannel, type AppSettings, type ThemeSource } from '@shared/ipc'
import { getDatabase } from '../db'
import { getAppConfig, saveTheme } from '../db/appConfig'

const THEME_SOURCES: readonly ThemeSource[] = ['system', 'light', 'dark']

function isThemeSource(value: unknown): value is ThemeSource {
  return typeof value === 'string' && (THEME_SOURCES as readonly string[]).includes(value)
}

export function registerConfigIpcHandlers(): void {
  ipcMain.handle(IpcChannel.ConfigGet, (): AppSettings => {
    return { theme: getAppConfig(getDatabase()).theme, appVersion: app.getVersion() }
  })

  ipcMain.handle(IpcChannel.ConfigSetTheme, (_event, theme: unknown): AppSettings => {
    if (!isThemeSource(theme)) {
      throw new Error(`Unknown theme source: ${String(theme)}`)
    }

    const config = saveTheme(getDatabase(), theme)
    // Drives prefers-color-scheme in the renderer, and the title-bar overlay
    // colors via the nativeTheme 'updated' listener in src/main/index.ts.
    nativeTheme.themeSource = config.theme
    return { theme: config.theme, appVersion: app.getVersion() }
  })
}
