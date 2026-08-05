import { app, shell, nativeTheme, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { initDatabase, getDatabase } from './db'
import { getAppConfig } from './db/appConfig'
import { registerIpcHandlers } from './ipc'
import { getThumbnailDir } from './storage/paths'
import { registerThumbnailProtocol, registerThumbnailScheme } from './thumbnails/protocol'
import {
  applyTitleBarOverlay,
  backgroundColorForTheme,
  titleBarOverlayForTheme
} from './window/titleBar'

const isDev = !app.isPackaged

// Must happen before 'ready', unlike the protocol handler itself.
registerThumbnailScheme()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    // Painted before the renderer loads, so the window doesn't flash white
    // (or black) in the wrong theme on launch.
    backgroundColor: backgroundColorForTheme(),
    autoHideMenuBar: true,
    // The renderer's own top bar doubles as the title bar. Windows and Linux
    // draw the window controls as a recolorable overlay on top of it; macOS
    // draws traffic lights on the left instead and ignores these colors, which
    // the renderer accounts for via env(titlebar-area-x).
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlayForTheme(),
    minWidth: 720,
    minHeight: 480,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // Fires both when the user picks a theme (config:set-theme assigns
  // themeSource) and when the OS theme flips while the preference is 'system'.
  const onThemeUpdated = (): void => {
    applyTitleBarOverlay(mainWindow)
    mainWindow.setBackgroundColor(backgroundColorForTheme())
  }
  nativeTheme.on('updated', onThemeUpdated)
  mainWindow.on('closed', () => nativeTheme.off('updated', onThemeUpdated))

  // Open external links in the OS browser instead of a new Electron window.
  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(() => {
  app.setAppUserModelId('com.ocaris.app')

  initDatabase()
  registerIpcHandlers()
  registerThumbnailProtocol(getThumbnailDir())

  // Before the first window: createWindow() reads the resolved theme for its
  // background color, and shouldUseDarkColors only reflects the stored
  // preference once themeSource is set.
  nativeTheme.themeSource = getAppConfig(getDatabase()).theme

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
