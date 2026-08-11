import { app, shell, nativeTheme, screen, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { initDatabase, getDatabase } from './db'
import { getAppConfig, getWindowBoundsJson, saveWindowBounds } from './db/appConfig'
import { registerIpcHandlers } from './ipc'
import { getThumbnailDir } from './storage/paths'
import { registerThumbnailProtocol, registerThumbnailScheme } from './thumbnails/protocol'
import { MIN_HEIGHT, MIN_WIDTH, parseWindowBounds } from './window/bounds'
import {
  applyTitleBarOverlay,
  backgroundColorForTheme,
  titleBarOverlayForTheme
} from './window/titleBar'

const isDev = !app.isPackaged

/** Bounds are also written while the window moves, so a crash or a force-quit
 *  doesn't lose the layout. Long enough not to write once per drag frame. */
const BOUNDS_SAVE_DEBOUNCE_MS = 500

// Must happen before 'ready', unlike the protocol handler itself.
registerThumbnailScheme()

function createWindow(): void {
  const restored = parseWindowBounds(
    getWindowBoundsJson(getDatabase()),
    screen.getAllDisplays().map((display) => display.workArea)
  )

  const mainWindow = new BrowserWindow({
    width: restored.width,
    height: restored.height,
    // Electron centers the window on the primary display when these are
    // undefined, which is what an unusable stored position falls back to.
    ...(restored.x !== null && restored.y !== null ? { x: restored.x, y: restored.y } : {}),
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
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (restored.maximized) mainWindow.maximize()

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // getNormalBounds(), not getBounds(): a maximized window would otherwise
  // store the screen-filling rect and un-maximize to the wrong size next run.
  const persistBounds = (): void => {
    if (mainWindow.isDestroyed() || mainWindow.isMinimized()) return
    const { x, y, width, height } = mainWindow.getNormalBounds()
    saveWindowBounds(getDatabase(), { x, y, width, height, maximized: mainWindow.isMaximized() })
  }

  let boundsTimer: NodeJS.Timeout | undefined
  const persistBoundsSoon = (): void => {
    if (boundsTimer) clearTimeout(boundsTimer)
    boundsTimer = setTimeout(persistBounds, BOUNDS_SAVE_DEBOUNCE_MS)
  }

  mainWindow.on('resize', persistBoundsSoon)
  mainWindow.on('move', persistBoundsSoon)
  mainWindow.on('maximize', persistBoundsSoon)
  mainWindow.on('unmaximize', persistBoundsSoon)
  // The window is still alive on 'close' (unlike 'closed'), so this is the last
  // point its geometry can be read.
  mainWindow.on('close', () => {
    if (boundsTimer) clearTimeout(boundsTimer)
    persistBounds()
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
