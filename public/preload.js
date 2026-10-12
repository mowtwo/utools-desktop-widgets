// 插件应用主界面 preload：晾衣绳状态的唯一持有者
// - 状态与图片存插件应用本地数据目录（屏幕 ID、截图都只属于这台设备，见官方文档「数据存储 / 应用数据」）
// - 管理悬浮层自定义窗口：只开在一块屏幕上，屏幕拔掉时回退到主屏
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { ipcRenderer } = require('electron')

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'svg']
const DISPLAY_POLL_MS = 2000

const dataDir = utools.getPluginLocalDataPath()
const imageDir = path.join(dataDir, 'images')
const stateFile = path.join(dataDir, 'state.json')

const defaultState = {
  enabled: true,
  /** auto：鼠标碰到屏幕顶边时滑出；pinned：常驻 */
  mode: 'auto',
  /** 用户选择的屏幕；null 表示主屏 */
  displayId: null,
  maxItems: 12,
  clock: true,
  /** 新的在前 */
  items: [],
}

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    const state = { ...defaultState, ...saved }
    // 清掉文件已经不存在的图片
    state.items = state.items.filter((it) => it.type !== 'image' || fs.existsSync(it.path))
    return state
  } catch {
    return { ...defaultState }
  }
}

let state = loadState()
const listeners = new Set()

/** 悬浮层：{ win, displayId, ready } */
let overlay = null
let displayTimer = null

function saveState() {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify(state), 'utf-8')
}

function resolveDisplay() {
  const displays = utools.getAllDisplays()
  const chosen = state.displayId != null && displays.find((d) => d.id === state.displayId)
  return { display: chosen || utools.getPrimaryDisplay(), fallback: state.displayId != null && !chosen }
}

/** 给前端和悬浮层看的视图：图片路径转成 file:// 地址 */
function viewItems() {
  return state.items.map((it) => {
    if (it.type === 'image') return { ...it, src: pathToFileURL(it.path).href }
    if (it.type === 'file') {
      const isImage = IMAGE_EXTS.includes(path.extname(it.path).slice(1).toLowerCase())
      return { ...it, src: isImage ? pathToFileURL(it.path).href : null }
    }
    return it
  })
}

function snapshot() {
  const { display, fallback } = resolveDisplay()
  return {
    enabled: state.enabled,
    mode: state.mode,
    displayId: state.displayId,
    activeDisplayId: display.id,
    displayFallback: fallback,
    maxItems: state.maxItems,
    clock: state.clock,
    items: viewItems(),
  }
}

function pushToOverlay() {
  if (!overlay || !overlay.ready || overlay.win.isDestroyed()) return
  const { display } = resolveDisplay()
  overlay.win.webContents.send('overlay:state', {
    mode: state.mode,
    clock: state.clock,
    items: viewItems(),
    bounds: display.bounds,
    // macOS 菜单栏、顶部任务栏占掉的高度，绳子挂在它下面
    topInset: display.workArea.y - display.bounds.y,
  })
}

function emit() {
  const snap = snapshot()
  for (const l of listeners) l(snap)
  pushToOverlay()
}

function closeOverlay() {
  if (overlay && !overlay.win.isDestroyed()) overlay.win.destroy()
  overlay = null
}

function openOverlay(display) {
  const { bounds } = display
  // Windows 下使用 fullscreen 避免窗口尺寸限制（见官方文档「全屏透明置顶窗口」）
  const fullscreenable = utools.isWindows()
  const entry = { win: null, displayId: display.id, ready: false }
  entry.win = utools.createBrowserWindow(
    'overlay.html',
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
      acceptFirstMouse: true,
      webPreferences: { preload: 'overlay_preload.js' },
    },
    () => {
      const { win } = entry
      // 默认整窗点击穿透；forward 让悬浮层仍收到 mousemove，用来判断鼠标是否在挂件上
      win.setIgnoreMouseEvents(true, { forward: true })
      // 只用默认置顶层级，不用 screen-saver，免得盖住同样置顶的 uTools 搜索框
      win.setAlwaysOnTop(true)
      try {
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      } catch {}
      // 不抢走用户当前窗口的焦点
      win.showInactive()
    },
  )
  overlay = entry
}

/** 让悬浮层与当前状态、屏幕布局一致 */
function syncOverlay() {
  if (!state.enabled) {
    closeOverlay()
    return
  }
  const { display } = resolveDisplay()
  if (overlay && (overlay.win.isDestroyed() || overlay.displayId !== display.id)) closeOverlay()
  if (!overlay) openOverlay(display)
  else pushToOverlay()
}

function startDisplayWatch() {
  if (displayTimer) return
  let lastKey = ''
  displayTimer = setInterval(() => {
    const key = utools
      .getAllDisplays()
      .map((d) => `${d.id}:${d.bounds.x},${d.bounds.y},${d.bounds.width}x${d.bounds.height}:${d.workArea.y}`)
      .join('|')
    if (key === lastKey) return
    const changed = lastKey !== ''
    lastKey = key
    // 屏幕插拔或分辨率变化：重新选屏（选中的屏幕没了就回退主屏），并通知设置页
    if (changed) {
      closeOverlay()
      syncOverlay()
      emit()
    }
  }, DISPLAY_POLL_MS)
}

function update(patch) {
  state = { ...state, ...patch }
  saveState()
  syncOverlay()
  emit()
}

function addItems(newItems) {
  const items = [...newItems, ...state.items]
  // 超出上限：最旧的掉下去，我们自己保存的图片顺手删掉
  for (const dropped of items.slice(state.maxItems)) removeOwnedFile(dropped)
  update({ items: items.slice(0, state.maxItems) })
  ipcSend('overlay:peek')
}

function removeOwnedFile(item) {
  if (item.type !== 'image') return
  try {
    fs.rmSync(item.path, { force: true })
  } catch {}
}

function ipcSend(channel, ...args) {
  if (overlay && overlay.ready && !overlay.win.isDestroyed()) overlay.win.webContents.send(channel, ...args)
}

function addImageData(dataUrl) {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('不支持的图片数据')
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  fs.mkdirSync(imageDir, { recursive: true })
  const id = randomUUID()
  const file = path.join(imageDir, `${id}.${ext}`)
  fs.writeFileSync(file, Buffer.from(match[2], 'base64'))
  addItems([{ id, type: 'image', path: file, createdAt: Date.now() }])
}

ipcRenderer.on('overlay:ready', () => {
  if (!overlay) return
  overlay.ready = true
  pushToOverlay()
  // 刚打开时先滑下来露个面，让用户知道绳子在哪
  ipcSend('overlay:peek')
})

ipcRenderer.on('overlay:interactive', (_e, interactive) => {
  if (!overlay || overlay.win.isDestroyed()) return
  overlay.win.setIgnoreMouseEvents(!interactive, { forward: true })
})

ipcRenderer.on('overlay:remove', (_e, id) => {
  window.services.removeItem(id)
})

ipcRenderer.on('overlay:hide-clock', () => {
  update({ clock: false })
})

window.services = {
  getState: snapshot,
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  listDisplays() {
    const primary = utools.getPrimaryDisplay()
    return utools.getAllDisplays().map((d) => ({
      id: d.id,
      label: d.label || '',
      width: d.bounds.width,
      height: d.bounds.height,
      scaleFactor: d.scaleFactor,
      primary: d.id === primary.id,
    }))
  },
  /** 启动或重新进入插件时调用 */
  start() {
    syncOverlay()
    startDisplayWatch()
  },
  setEnabled: (enabled) => update({ enabled }),
  setMode: (mode) => update({ mode }),
  setDisplay: (displayId) => update({ displayId }),
  setClock: (clock) => update({ clock }),
  setMaxItems(maxItems) {
    for (const dropped of state.items.slice(maxItems)) removeOwnedFile(dropped)
    update({ maxItems, items: state.items.slice(0, maxItems) })
  },
  addImageData,
  addNote(text) {
    const trimmed = text.trim()
    if (!trimmed) return
    addItems([{ id: randomUUID(), type: 'note', text: trimmed, createdAt: Date.now() }])
  },
  /** 挂文件只记路径，不复制、不删除用户的文件 */
  addFiles(paths) {
    const items = paths
      .filter((p) => fs.existsSync(p))
      .map((p) => ({
        id: randomUUID(),
        type: 'file',
        path: p,
        name: path.basename(p),
        icon: utools.getFileIcon(p),
        createdAt: Date.now(),
      }))
    if (items.length) addItems(items)
  },
  removeItem(id) {
    const item = state.items.find((it) => it.id === id)
    if (!item) return
    removeOwnedFile(item)
    update({ items: state.items.filter((it) => it.id !== id) })
  },
  clearItems() {
    for (const it of state.items) removeOwnedFile(it)
    update({ items: [] })
  },
  /** 开发模式下打开悬浮层的开发者工具 */
  openOverlayDevTools() {
    if (overlay && !overlay.win.isDestroyed()) overlay.win.webContents.openDevTools({ mode: 'detach' })
  },
}
