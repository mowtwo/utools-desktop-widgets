// 插件应用主界面 preload：管理每块屏幕上的全屏透明悬浮层窗口
const { ipcRenderer } = require('electron')

/** displayId -> { win, ready } */
const overlays = new Map()
let latestSettings = null
let widgetMovedListener = null

function sendSettings(entry, displayId) {
  if (!latestSettings || !entry.ready || entry.win.isDestroyed()) return
  const display = utools.getAllDisplays().find((d) => d.id === displayId)
  if (!display) return
  entry.win.webContents.send('overlay:settings', { settings: latestSettings, bounds: display.bounds })
}

function createOverlay(display) {
  const { bounds } = display
  // Windows 下使用 fullscreen 避免窗口尺寸限制（见官方文档「全屏透明置顶窗口」）
  const fullscreenable = utools.isWindows()
  const entry = { win: null, ready: false }
  entry.win = utools.createBrowserWindow(
    `overlay.html?display=${display.id}`,
    {
      show: false,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      backgroundColor: '#00000000',
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable,
      fullscreen: fullscreenable,
      autoHideMenuBar: true,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      alwaysOnTop: true,
      roundedCorners: false,
      hasShadow: false,
      webPreferences: { preload: 'overlay_preload.js' },
    },
    () => {
      const { win } = entry
      // 默认整窗点击穿透；forward 让悬浮层仍能收到 mousemove，用来判断鼠标是否进入挂件
      win.setIgnoreMouseEvents(true, { forward: true })
      try {
        win.setAlwaysOnTop(true, 'screen-saver')
      } catch {}
      try {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      } catch {}
      // 不抢走用户当前窗口的焦点
      win.showInactive()
    },
  )
  overlays.set(display.id, entry)
}

function closeAll() {
  for (const { win } of overlays.values()) {
    if (!win.isDestroyed()) win.destroy()
  }
  overlays.clear()
}

ipcRenderer.on('overlay:ready', (_e, displayId) => {
  const entry = overlays.get(displayId)
  if (!entry) return
  entry.ready = true
  sendSettings(entry, displayId)
})

ipcRenderer.on('overlay:interactive', (_e, displayId, interactive) => {
  const entry = overlays.get(displayId)
  if (!entry || entry.win.isDestroyed()) return
  entry.win.setIgnoreMouseEvents(!interactive, { forward: true })
})

ipcRenderer.on('overlay:widget-moved', (_e, id, x, y) => {
  widgetMovedListener?.(id, x, y)
})

window.services = {
  /** 按当前屏幕布局打开（或补齐）悬浮层，并推送最新设置 */
  showOverlays(settings) {
    latestSettings = settings
    const displays = utools.getAllDisplays()
    const ids = new Set(displays.map((d) => d.id))
    // 已拔掉的屏幕：关闭对应悬浮层
    for (const [id, entry] of overlays) {
      if (!ids.has(id) || entry.win.isDestroyed()) {
        if (!entry.win.isDestroyed()) entry.win.destroy()
        overlays.delete(id)
      }
    }
    for (const display of displays) {
      const entry = overlays.get(display.id)
      if (entry) sendSettings(entry, display.id)
      else createOverlay(display)
    }
  },
  hideOverlays() {
    closeAll()
  },
  isOverlayVisible() {
    for (const { win } of overlays.values()) if (!win.isDestroyed()) return true
    return false
  },
  onWidgetMoved(listener) {
    widgetMovedListener = listener
  },
}
