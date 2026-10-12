// 插件应用主界面 preload：晾衣绳状态的唯一持有者
// - 状态与图片存插件应用本地数据目录（屏幕 ID、截图都只属于这台设备，见官方文档「数据存储 / 应用数据」）
// - 管理悬浮层自定义窗口：只开在一块屏幕上，屏幕拔掉时回退到主屏
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { ipcRenderer, clipboard } = require('electron')

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'svg']
const CONTENT_TYPES = ['image', 'note', 'file']
const DISPLAY_POLL_MS = 2000
/** 两件东西之间的默认间距（px），与悬浮层 layout.ts 的 SPACING 一致 */
const SPACING = 174
/** 夹子能放的范围（占绳长的比例），两端留出淡出区 */
const X_MIN = 0.04
const X_MAX = 0.96

const dataDir = utools.getPluginLocalDataPath()
const imageDir = path.join(dataDir, 'images')
const stateFile = path.join(dataDir, 'state.json')

const defaultState = {
  enabled: true,
  /** auto：鼠标碰到屏幕顶边时滑出；pinned：常驻 */
  mode: 'auto',
  /** 用户选择的屏幕；null 表示主屏 */
  displayId: null,
  /** 最多挂几件（只算图片、便签、文件，不算时钟和空夹子） */
  maxItems: 12,
  /** 收起后小把手的位置：left / center / right；null 表示自动（刘海屏放右边） */
  handle: null,
  /** 每件都有 x：在绳子上的位置，占绳长的比例 */
  items: [{ id: 'clock', type: 'clock', x: 0.12, createdAt: 0 }],
}

const clampX = (x) => Math.min(X_MAX, Math.max(X_MIN, x))

/**
 * 是否是刘海屏：官方 API 没有直接给出刘海区域，按菜单栏高度推断。
 * 带刘海的 MacBook 菜单栏约 33~37pt，普通屏幕约 24pt；开了自动隐藏菜单栏时无法识别。
 */
function hasNotch(display) {
  return utools.isMacOS() && display.workArea.y - display.bounds.y >= 30
}

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    const state = { ...defaultState, ...saved }
    // 清掉文件已经不存在的图片
    state.items = state.items.filter((it) => it.type !== 'image' || fs.existsSync(it.path))
    // 旧版本没有位置：按顺序均匀排开
    state.items.forEach((it, i) => {
      if (typeof it.x !== 'number') it.x = clampX(0.2 + (0.6 * i) / Math.max(1, state.items.length - 1))
    })
    if (typeof saved.clock === 'boolean') {
      if (saved.clock && !state.items.some((it) => it.type === 'clock')) state.items.push({ ...defaultState.items[0] })
      delete state.clock
    }
    return state
  } catch {
    return { ...defaultState, items: [...defaultState.items] }
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
    handle: state.handle,
    notch: hasNotch(display),
    clock: state.items.some((it) => it.type === 'clock'),
    items: viewItems(),
  }
}

function ipcSend(channel, ...args) {
  if (overlay && overlay.ready && !overlay.win.isDestroyed()) overlay.win.webContents.send(channel, ...args)
}

function pushToOverlay() {
  const { display } = resolveDisplay()
  ipcSend('overlay:state', {
    mode: state.mode,
    items: viewItems(),
    bounds: display.bounds,
    // macOS 菜单栏、顶部任务栏占掉的高度，绳子挂在它下面
    topInset: display.workArea.y - display.bounds.y,
    notch: hasNotch(display),
    handle: state.handle || (hasNotch(display) ? 'right' : 'center'),
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
      // 官方文档「全屏透明置顶窗口 / 性能注意」：透明窗口可能被降低渲染优先级，backgroundThrottling 能缓解一部分
      webPreferences: { preload: 'overlay_preload.js', backgroundThrottling: false },
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
      // 悬浮层不在前台、内容又几乎全透明，容易被节流，导致光标轮询和绳子动画停掉
      try {
        win.webContents.setBackgroundThrottling(false)
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

function removeOwnedFile(item) {
  if (item.type !== 'image') return
  try {
    fs.rmSync(item.path, { force: true })
  } catch {}
}

/** 绳上最大的空当的中点，新东西挂那里 */
function freeX() {
  const xs = state.items.map((it) => it.x).sort((a, b) => a - b)
  const edges = [X_MIN, ...xs, X_MAX]
  let best = 0.5
  let widest = -1
  for (let i = 0; i < edges.length - 1; i++) {
    const gap = edges[i + 1] - edges[i]
    if (gap > widest) {
      widest = gap
      best = (edges[i] + edges[i + 1]) / 2
    }
  }
  return best
}

/**
 * 挂上新东西
 * @param at.x 指定位置（占绳长的比例），不给就挂在最大空当
 * @param at.clipId 挂到这个空夹子上，夹子被替换
 */
function hang(newItems, at = {}) {
  if (!newItems.length) return
  let items = state.items
  let x = at.x
  if (at.clipId) {
    const clip = items.find((it) => it.id === at.clipId)
    if (clip) x = clip.x
    items = items.filter((it) => it.id !== at.clipId)
  }
  state = { ...state, items }
  const step = SPACING / resolveDisplay().display.bounds.width
  const start = x ?? freeX()
  const placed = newItems.map((it, i) => ({ ...it, x: clampX(start + i * step) }))
  items = [...placed, ...items]
  // 超出上限：最旧的掉下去，我们自己保存的图片顺手删掉
  const content = items.filter((it) => CONTENT_TYPES.includes(it.type)).sort((a, b) => b.createdAt - a.createdAt)
  const dropped = new Set(content.slice(state.maxItems).map((it) => it.id))
  for (const it of items) if (dropped.has(it.id)) removeOwnedFile(it)
  update({ items: items.filter((it) => !dropped.has(it.id)) })
  ipcSend('overlay:peek')
}

function imageItem(dataUrl) {
  const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl)
  if (!match) throw new Error('不支持的图片数据')
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1]
  fs.mkdirSync(imageDir, { recursive: true })
  const id = randomUUID()
  const file = path.join(imageDir, `${id}.${ext}`)
  fs.writeFileSync(file, Buffer.from(match[2], 'base64'))
  return { id, type: 'image', path: file, createdAt: Date.now() }
}

function noteItem(text) {
  const trimmed = text.trim()
  return trimmed ? { id: randomUUID(), type: 'note', text: trimmed, createdAt: Date.now() } : null
}

/** 挂文件只记路径，不复制、不删除用户的文件 */
function fileItems(paths) {
  return paths
    .filter((p) => fs.existsSync(p))
    .map((p) => ({
      id: randomUUID(),
      type: 'file',
      path: p,
      name: path.basename(p),
      icon: utools.getFileIcon(p),
      createdAt: Date.now(),
    }))
}

/** 剪贴板里的东西：文件 > 图片 > 文字 */
function clipboardItems() {
  const files = utools.getCopiedFiles()
  if (files && files.length) return fileItems(files.map((f) => f.path))
  const image = clipboard.readImage()
  if (!image.isEmpty()) return [imageItem(image.toDataURL())]
  const note = noteItem(clipboard.readText())
  return note ? [note] : []
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

ipcRenderer.on('overlay:repaint', () => {
  if (overlay && !overlay.win.isDestroyed()) overlay.win.webContents.invalidate()
})

ipcRenderer.on('overlay:remove', (_e, id) => {
  window.services.removeItem(id)
})

ipcRenderer.on('overlay:move', (_e, id, x) => {
  update({ items: state.items.map((it) => (it.id === id ? { ...it, x: clampX(x) } : it)) })
})

ipcRenderer.on('overlay:add-clip', (_e, x) => {
  update({ items: [...state.items, { id: randomUUID(), type: 'clip', x: clampX(x), createdAt: Date.now() }] })
})

ipcRenderer.on('overlay:fill-clip', async (_e, clipId, source) => {
  try {
    if (source === 'files') {
      const paths = utools.showOpenDialog({ title: '挂到夹子上', properties: ['openFile', 'multiSelections'] })
      if (paths && paths.length) hang(fileItems(paths), { clipId })
    } else if (source === 'paste') {
      const items = clipboardItems()
      if (items.length) hang(items, { clipId })
      else utools.showNotification('剪贴板里没有能挂的东西')
    } else if (source === 'capture') {
      hang([imageItem(await utools.screenCapture())], { clipId })
    }
  } catch {
    // 用户取消截图或选择
  }
})

ipcRenderer.on('overlay:drop', (_e, paths, x, clipId) => {
  hang(fileItems(paths), clipId ? { clipId } : { x })
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
  /** 把晾衣绳拉下来一会儿 */
  peek() {
    if (!state.enabled) update({ enabled: true })
    ipcSend('overlay:peek', 4000)
  },
  setEnabled: (enabled) => update({ enabled }),
  setMode: (mode) => update({ mode }),
  setHandle: (handle) => update({ handle }),
  setDisplay: (displayId) => update({ displayId }),
  setClock(on) {
    const items = state.items.filter((it) => it.type !== 'clock')
    if (on) items.push({ id: 'clock', type: 'clock', x: freeX(), createdAt: 0 })
    update({ items })
  },
  setMaxItems(maxItems) {
    const content = state.items.filter((it) => CONTENT_TYPES.includes(it.type)).sort((a, b) => b.createdAt - a.createdAt)
    const dropped = new Set(content.slice(maxItems).map((it) => it.id))
    for (const it of state.items) if (dropped.has(it.id)) removeOwnedFile(it)
    update({ maxItems, items: state.items.filter((it) => !dropped.has(it.id)) })
  },
  addImageData: (dataUrl) => hang([imageItem(dataUrl)]),
  addNote(text) {
    const note = noteItem(text)
    if (note) hang([note])
  },
  addFiles: (paths) => hang(fileItems(paths)),
  removeItem(id) {
    const item = state.items.find((it) => it.id === id)
    if (!item) return
    removeOwnedFile(item)
    update({ items: state.items.filter((it) => it.id !== id) })
  },
  /** 取下所有图片、便签、文件和空夹子，时钟留着 */
  clearItems() {
    for (const it of state.items) removeOwnedFile(it)
    update({ items: state.items.filter((it) => it.type === 'clock') })
  },
  /** 开发模式下打开悬浮层的开发者工具 */
  openOverlayDevTools() {
    if (overlay && !overlay.win.isDestroyed()) overlay.win.webContents.openDevTools({ mode: 'detach' })
  },
}
