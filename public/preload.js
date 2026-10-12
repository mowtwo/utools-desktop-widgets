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
const logFile = path.join(dataDir, 'debug.log')
/** 守护定时任务：插件在后台被 uTools 结束后，每分钟把它拉起来、重开悬浮层 */
const KEEPALIVE = 'keepalive'

/** 运行日志：排查悬浮层消失、唤不出来时用；超过 256KB 轮换一次 */
function log(event, detail) {
  try {
    fs.mkdirSync(dataDir, { recursive: true })
    try {
      if (fs.statSync(logFile).size > 256 * 1024) fs.renameSync(logFile, logFile + '.1')
    } catch {}
    const line = `${new Date().toISOString()} main ${event}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}\n`
    fs.appendFileSync(logFile, line)
  } catch {}
}

const defaultState = {
  enabled: true,
  /** auto：鼠标碰到屏幕顶边时滑出；pinned：常驻 */
  mode: 'auto',
  /** 用户选择的屏幕；null 表示主屏 */
  displayId: null,
  /** 最多挂几件（只算图片、便签、文件，不算挂件和空夹子） */
  maxItems: 12,
  /** 收起后小把手的位置：left / center / right；null 表示自动（刘海屏放右边） */
  handle: null,
  /** 自动隐藏：鼠标离开多久后收起（ms） */
  hideDelay: 800,
  /** 每个扩展在悬浮层里的运行报错：{ [extId]: [{ time, message, line, fatal, count }] }，每个最多留 20 条 */
  extErrors: {},
  /** 信号：轮盘上的 8 个信号、截图尺寸、叠加的图标大小、截图后怎么处理、提示音 */
  ping: {
    /** lol：英雄联盟原版素材（Riot 同人政策）；open：开源素材（game-icons + Kenney） */
    style: 'lol',
    /** 原版风格的轮盘 */
    lolWheel: ['danger', 'push', 'omw', 'allin', 'assist', 'needvision', 'missing', 'enemyvision'],
    /** 开源风格的轮盘 */
    wheel: ['alert', 'coming', 'help', 'look', 'done', 'idea', 'question', 'danger'],
    /** 信号在屏幕上停留多久（ms） */
    duration: 1600,
    /** 开源风格的音效包：digital / interface */
    soundPack: 'digital',
    width: 480,
    height: 300,
    /** 信号图标大小（逻辑像素）。原版 110 是按 Windows 100% 缩放设计的物理像素，在 2 倍屏上约等于 56 */
    size: 56,
    /** 轮盘缩放比例 */
    wheelScale: 0.7,
    /** none 不截图 / copy 复制 / hang 挂到晾衣绳 / both 复制并挂上 */
    output: 'copy',
    /** 提示音默认关，免得吵 */
    sound: false,
  },
  /** 桌面地毯：花样、渲染等级、拖拽精度 */
  rug: {
    enabled: false,
    material: 'persian',
    /** high / medium / low：像素密度、阴影质量 */
    quality: 'medium',
    /** fine / standard / eco：布料模拟的迭代次数 */
    precision: 'standard',
  },
  /** 渲染保活点：悬浮层持续小幅重绘，避免拉下后不显示 */
  renderAnchor: true,
  /** 试验：用户拉下晾衣绳时让悬浮层获得焦点，换取正常的渲染帧率，代价是抢走当前窗口的键盘焦点 */
  focusOnReveal: false,
  /** 开发模式下的诊断面板，默认关 */
  debugHud: false,
  /** 内置挂件扩展是否已写入过数据库（删掉后不再自动补回） */
  seeded: false,
  /** 每件都有 x：在绳子上的位置，占绳长的比例 */
  items: [{ id: 'clock', type: 'widget', ext: 'clock', x: 0.12, createdAt: 0 }],
}

/** 挂件扩展存同步数据库：用户自己写的脚本，换设备也要在（见官方文档「数据存储 / 用户数据」） */
const EXT_PREFIX = 'ext/'

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
    const state = {
      ...defaultState,
      ...saved,
      ping: { ...defaultState.ping, ...(saved.ping || {}) },
      rug: { ...defaultState.rug, ...(saved.rug || {}) },
    }
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
    // 旧版本的时钟类型改成「时钟」挂件扩展的实例
    state.items = state.items.map((it) => (it.type === 'clock' ? { ...it, type: 'widget', ext: 'clock' } : it))
    return state
  } catch {
    return { ...defaultState, items: [...defaultState.items] }
  }
}

let state = loadState()
const listeners = new Set()

function loadExtensions() {
  return utools.db.allDocs(EXT_PREFIX).map((d) => ({
    id: d._id.slice(EXT_PREFIX.length),
    name: d.name,
    code: d.code,
    width: d.width,
    height: d.height,
    settings: d.settings,
    builtin: !!d.builtin,
    updatedAt: d.updatedAt,
  }))
}

let extensions = loadExtensions()

/** 悬浮层：{ win, displayId, ready } */
let overlay = null
let displayTimer = null
/** 悬浮层还没准备好时按下的信号快捷键，等它就绪再弹出轮盘 */
let pendingPing = null
/** 桌面地毯窗口：{ win, key, shown }，key 是打开它时用的参数，参数变了就重开 */
let rug = null
/** 晾衣绳窗口还没显示出来，地毯等它显示后再建 */
let rugWaiting = false
/** 地毯编辑模式：浮到最上层、可以拖动缩放；平时完全点击穿透 */
let rugEditing = false

/** 拖拽精度 → rug.js 的约束迭代次数和子步数 */
const RUG_PRECISION = { fine: { iter: 8, sub: 3 }, standard: { iter: 6, sub: 2 }, eco: { iter: 4, sub: 2 } }

/** 进入 / 退出地毯编辑模式 */
function setRugEditing(on) {
  if (on && (!state.rug.enabled || !rug || rug.win.isDestroyed())) {
    utools.showNotification('先在设置里打开桌面地毯')
    return
  }
  rugEditing = on
  log('rug-edit', { on })
  if (!rug || rug.win.isDestroyed()) return emit()
  const { win } = rug
  win.webContents.send('rug:edit', on)
  if (on) {
    // 浮到最上层，地毯上的点击由页面按地毯轮廓决定接不接收
    win.setAlwaysOnTop(true)
    win.setIgnoreMouseEvents(true, { forward: true })
    win.showInactive()
    win.moveTop()
  } else {
    // 回到最底层，完全点击穿透
    win.setAlwaysOnTop(false)
    win.setIgnoreMouseEvents(true)
    win.blur()
  }
  emit()
}

function closeRug(reason) {
  rugEditing = false
  if (!rug) return
  log('rug-close', { reason })
  if (!rug.win.isDestroyed()) rug.win.destroy()
  rug = null
}

/**
 * 地毯窗口：普通层级、不置顶，显示后推到最底层。
 * 这样它在桌面图标之上，而任何应用窗口被点到前面时都会盖住它（Electron 没法像原版那样设到「桌面图标层 + 1」）
 */
function syncRug() {
  if (!state.rug.enabled) return closeRug('disabled')
  // 晾衣绳窗口还没显示：等它显示后再建，免得两个窗口同时创建
  if (state.enabled && (!overlay || !overlay.shown)) {
    rugWaiting = true
    return
  }
  const { display } = resolveDisplay()
  const p = RUG_PRECISION[state.rug.precision] || RUG_PRECISION.standard
  const query = new URLSearchParams({
    material: state.rug.material,
    quality: state.rug.quality,
    iter: String(p.iter),
    sub: String(p.sub),
    lang: 'zh-Hans',
    bx: String(display.bounds.x),
    by: String(display.bounds.y),
  })
  // 花样在地毯里切换后只是存下来，不需要重开窗口
  const key = `${display.id}|${state.rug.quality}|${state.rug.precision}`
  if (rug && !rug.win.isDestroyed() && rug.key === key) return
  closeRug('reopen')
  const { bounds } = display
  log('rug-open', { display: display.id, quality: state.rug.quality, precision: state.rug.precision })
  const entry = { win: null, key, shown: false }
  entry.win = utools.createBrowserWindow(
    `rug.html?${query}`,
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
      fullscreenable: false,
      skipTaskbar: true,
      enableLargerThanScreen: true,
      roundedCorners: false,
      hasShadow: false,
      acceptFirstMouse: true,
      webPreferences: { preload: 'rug_preload.js', backgroundThrottling: false },
    },
    () => presentRug(entry, 'callback'),
  )
  rug = entry
}

/** 把地毯显示出来（同 presentOverlay：创建回调和页面报到谁先到谁执行） */
function presentRug(entry, via) {
  if (entry.shown || entry.win.isDestroyed()) return
  entry.shown = true
  const { win } = entry
  log('rug-shown', { via })
  // 平时完全点击穿透：地毯只在编辑模式下接收鼠标
  win.setIgnoreMouseEvents(true)
  try {
    win.setVisibleOnAllWorkspaces(true)
  } catch {}
  win.showInactive()
  // 推到最底层：在桌面图标之上、所有应用窗口之下
  win.blur()
}

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
function isImagePath(p) {
  return IMAGE_EXTS.includes(path.extname(p).slice(1).toLowerCase())
}

function viewItems() {
  return state.items.map((it) => {
    if (it.type === 'image') return { ...it, src: pathToFileURL(it.path).href }
    if (it.type === 'file') return { ...it, src: !it.isDirectory && isImagePath(it.path) ? pathToFileURL(it.path).href : null }
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
    hideDelay: state.hideDelay,
    seeded: state.seeded,
    debugHud: state.debugHud,
    extErrors: state.extErrors,
    focusOnReveal: state.focusOnReveal,
    renderAnchor: state.renderAnchor,
    ping: state.ping,
    rug: state.rug,
    rugEditing,
    items: viewItems(),
    extensions,
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
    hideDelay: state.hideDelay,
    extensions,
    debug: state.debugHud && utools.isDev(),
    renderAnchor: state.renderAnchor,
    ping: state.ping,
  })
}

function emit() {
  const snap = snapshot()
  for (const l of listeners) l(snap)
  pushToOverlay()
}

function closeOverlay(reason) {
  if (overlay) log('overlay-close', { reason })
  if (overlay && !overlay.win.isDestroyed()) overlay.win.destroy()
  overlay = null
}

function openOverlay(display) {
  log('overlay-open', { display: display.id, bounds: display.bounds, workAreaY: display.workArea.y })
  const { bounds } = display
  // Windows 下使用 fullscreen 避免窗口尺寸限制（见官方文档「全屏透明置顶窗口」）
  const fullscreenable = utools.isWindows()
  const entry = { win: null, displayId: display.id, ready: false, shown: false }
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
    () => presentOverlay(entry, 'callback'),
  )
  overlay = entry
}

/**
 * 把悬浮层显示出来。创建回调和页面报到（overlay:ready）谁先到谁执行，只执行一次：
 * 两个自定义窗口几乎同时创建时，先建的那个的回调可能不会被调用，窗口就一直停在隐藏状态
 */
function presentOverlay(entry, via) {
  if (entry.shown || entry.win.isDestroyed()) return
  entry.shown = true
  const { win } = entry
  log('overlay-shown', { via })
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
  // 等晾衣绳显示出来再建地毯窗口，两个窗口不要同时创建
  if (rugWaiting) {
    rugWaiting = false
    syncRug()
  }
}

/** 让悬浮层与当前状态、屏幕布局一致 */
function syncOverlay() {
  if (!state.enabled) {
    closeOverlay('disabled')
    return
  }
  const { display } = resolveDisplay()
  if (overlay && overlay.win.isDestroyed()) closeOverlay('destroyed')
  else if (overlay && overlay.displayId !== display.id) closeOverlay('display-switch')
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
      log('displays-changed', key)
      closeOverlay('displays-changed')
      closeRug('displays-changed')
      syncOverlay()
      syncRug()
      emit()
    }
  }, DISPLAY_POLL_MS)
}

function update(patch) {
  state = { ...state, ...patch }
  saveState()
  syncOverlay()
  syncRug()
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

function extDoc(ext) {
  return {
    name: String(ext.name || '未命名').slice(0, 40),
    code: String(ext.code || ''),
    width: Number(ext.width) || 136,
    height: Number(ext.height) || 64,
    settings: String(ext.settings || ''),
    updatedAt: Date.now(),
  }
}

/** 快速便签最多几个字，与前端 TODO_MAX 一致 */
const TODO_MAX = 30

function todoItem(text) {
  const t = Array.from(String(text).replace(/\s+/g, ' ').trim()).slice(0, TODO_MAX).join('')
  return t ? { id: randomUUID(), type: 'todo', text: t, createdAt: Date.now() } : null
}

function widgetItem(ext) {
  return { id: randomUUID(), type: 'widget', ext, data: {}, createdAt: Date.now() }
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
    .map((p) => {
      const isDirectory = fs.statSync(p).isDirectory()
      return {
        id: randomUUID(),
        type: 'file',
        path: p,
        name: path.basename(p),
        isDirectory,
        icon: utools.getFileIcon(isDirectory ? 'folder' : p),
        createdAt: Date.now(),
      }
    })
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
  log('overlay-ready')
  if (!overlay) return
  overlay.ready = true
  presentOverlay(overlay, 'ready')
  pushToOverlay()
  // 悬浮层刚打开时按下的信号快捷键
  if (pendingPing) {
    ipcSend('overlay:ping-open', pendingPing)
    pendingPing = null
  }
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
    } else if (source === 'folder') {
      // 文件夹挂成可展开的衣架
      const paths = utools.showOpenDialog({ title: '把文件夹挂成衣架', properties: ['openDirectory'] })
      if (paths && paths.length) hang(fileItems(paths), { clipId })
    } else if (source === 'paste') {
      const items = clipboardItems()
      if (items.length) hang(items, { clipId })
      else utools.showNotification('剪贴板里没有能挂的东西')
    } else if (source === 'capture') {
      hang([imageItem(await utools.screenCapture())], { clipId })
    } else if (source.startsWith('widget:')) {
      hang([widgetItem(source.slice('widget:'.length))], { clipId })
    }
  } catch {
    // 用户取消截图或选择
  }
})

ipcRenderer.on('overlay:drop', (_e, paths, x, clipId) => {
  hang(fileItems(paths), clipId ? { clipId } : { x })
})

// 挂件 api.storage 的数据：只落盘，不广播（挂件自己已经有最新数据，广播会让它重建）
ipcRenderer.on('overlay:widget-data', (_e, id, data) => {
  state = { ...state, items: state.items.map((it) => (it.id === id ? { ...it, data } : it)) }
  saveState()
})

ipcRenderer.on('overlay:add-todo', (_e, text, clipId) => {
  const item = todoItem(text)
  if (item) hang([item], clipId ? { clipId } : {})
})

// 在夹子上直接写待办时需要键盘焦点，这会把 uTools 切到前台
ipcRenderer.on('overlay:focus', () => {
  if (overlay && !overlay.win.isDestroyed()) overlay.win.focus()
})

// 信号截图：静默截取晾衣绳所在屏幕，按 DIP 矩形裁出一块（截图是物理像素，要按实际比例换算）
ipcRenderer.on('overlay:ping-capture', async (_e, reqId, rect) => {
  try {
    const { display } = resolveDisplay()
    const [shot] = await utools.captureDisplay({ displayId: display.id })
    const img = shot.image
    const size = img.getSize()
    const scale = size.width / display.bounds.width
    const crop = {
      x: Math.max(0, Math.round((rect.x - display.bounds.x) * scale)),
      y: Math.max(0, Math.round((rect.y - display.bounds.y) * scale)),
      width: Math.round(rect.width * scale),
      height: Math.round(rect.height * scale),
    }
    crop.width = Math.min(crop.width, size.width - crop.x)
    crop.height = Math.min(crop.height, size.height - crop.y)
    ipcSend('overlay:ping-captured', reqId, { dataUrl: img.crop(crop).toDataURL(), scale })
  } catch (err) {
    log('ping-capture-failed', String(err && err.message))
    ipcSend('overlay:ping-captured', reqId, { error: String(err && err.message) })
  }
})

// 叠好图标的截图：按设置复制和 / 或挂到晾衣绳
ipcRenderer.on('overlay:ping-result', (_e, dataUrl) => {
  const output = state.ping.output
  if (output === 'copy' || output === 'both') utools.copyImage(dataUrl)
  if (output === 'hang' || output === 'both') hang([imageItem(dataUrl)])
})

// 挂件报错：同一条连着出现只累加次数；落盘和通知设置页都节流，挂件疯狂报错也不会拖慢插件
let errorFlush = 0
ipcRenderer.on('overlay:widget-error', (_e, ext, message, line, fatal) => {
  const list = [...(state.extErrors[ext] || [])]
  const last = list[list.length - 1]
  const msg = String(message).slice(0, 500)
  if (last && last.message === msg && last.line === line) list[list.length - 1] = { ...last, count: last.count + 1, time: Date.now() }
  else list.push({ time: Date.now(), message: msg, line: typeof line === 'number' ? line : undefined, fatal: !!fatal, count: 1 })
  state = { ...state, extErrors: { ...state.extErrors, [ext]: list.slice(-20) } }
  if (fatal) log('widget-fatal', { ext, message: msg })
  if (!errorFlush) {
    errorFlush = setTimeout(() => {
      errorFlush = 0
      saveState()
      const snap = snapshot()
      for (const l of listeners) l(snap)
    }, 2000)
  }
})

ipcRenderer.on('overlay:focus-on-reveal', () => {
  if (!state.focusOnReveal || !overlay || overlay.win.isDestroyed()) return
  overlay.win.focus()
  log('focus-on-reveal')
})

ipcRenderer.on('overlay:notify', (_e, text) => {
  utools.showNotification(String(text).slice(0, 200))
})

log('preload-start', { enabled: state.enabled, mode: state.mode })

utools.onPluginOut((isKill) => {
  log('plugin-out', { isKill })
  // uTools 被调到前台时地毯窗口可能跟着浮上来，退出插件时推回最底层（编辑中除外）
  if (rug && !rug.win.isDestroyed() && !rugEditing) rug.win.blur()
})

// 只有编辑模式下才接收鼠标
ipcRenderer.on('rug:accept', (_e, accept) => {
  if (!rugEditing || !rug || rug.win.isDestroyed()) return
  rug.win.setIgnoreMouseEvents(!accept, { forward: true })
})

ipcRenderer.on('rug:ready', () => {
  if (rug) presentRug(rug, 'ready')
})

ipcRenderer.on('rug:end-edit', () => setRugEditing(false))

ipcRenderer.on('rug:back', () => {
  if (rug && !rug.win.isDestroyed()) rug.win.blur()
  log('rug-back')
})

ipcRenderer.on('rug:material', (_e, id) => {
  state = { ...state, rug: { ...state.rug, material: String(id) } }
  saveState()
  emit()
})

ipcRenderer.on('rug:hide', () => update({ rug: { ...state.rug, enabled: false } }))

// 守护任务触发：插件刚被拉起来时直接重开悬浮层，不依赖设置页
utools.onScheduleTrigger(({ code }) => {
  if (code !== KEEPALIVE) return
  const alive = !!overlay && !overlay.win.isDestroyed()
  if (!alive) log('keepalive-restore')
  window.services.start()
})

// 其他设备同步过来新的扩展
utools.onDbPull((docs) => {
  if (!docs.some((d) => d._id.startsWith(EXT_PREFIX))) return
  extensions = loadExtensions()
  emit()
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
    syncRug()
    startDisplayWatch()
  },
  /** 在光标位置弹出信号轮盘 */
  ping() {
    if (!state.enabled) update({ enabled: true })
    const point = utools.getCursorScreenPoint()
    const { display } = resolveDisplay()
    const b = display.bounds
    if (point.x < b.x || point.x >= b.x + b.width || point.y < b.y || point.y >= b.y + b.height) {
      utools.showNotification('信号只能发在晾衣绳所在的屏幕上，可以在设置里换屏幕')
      return
    }
    if (overlay && overlay.ready && !overlay.win.isDestroyed()) ipcSend('overlay:ping-open', point)
    else {
      pendingPing = point
      syncOverlay()
    }
  },
  setPing: (patch) => update({ ping: { ...state.ping, ...patch } }),
  setRug(patch) {
    update({ rug: { ...state.rug, ...patch } })
    // 换花样不重开窗口，直接让地毯换
    if (patch.material && rug && !rug.win.isDestroyed()) {
      void rug.win.webContents.executeJavaScript(`window.rugSetMaterial && window.rugSetMaterial(${JSON.stringify(patch.material)})`)
    }
  },
  /** 进入地毯编辑模式：收起 uTools 面板，地毯浮到最上层，屏幕上方出现编辑工具栏 */
  editRug() {
    utools.hideMainWindow()
    setRugEditing(true)
  },
  /** 地毯放回屏幕中间并摊平 */
  resetRug() {
    if (rug && !rug.win.isDestroyed()) void rug.win.webContents.executeJavaScript('window.rugReset && window.rugReset()')
  },
  pingHotKey: () => utools.getCmdHotKey('发信号'),
  setPingHotKey: () => utools.redirectHotKeySetting('发信号'),
  /** 把晾衣绳拉下来一会儿 */
  peek() {
    if (!state.enabled) update({ enabled: true })
    ipcSend('overlay:peek', 4000)
  },
  setEnabled: (enabled) => update({ enabled }),
  setMode: (mode) => update({ mode }),
  setHandle: (handle) => update({ handle }),
  setHideDelay: (hideDelay) => update({ hideDelay }),
  setDebugHud: (debugHud) => update({ debugHud }),
  setFocusOnReveal: (focusOnReveal) => update({ focusOnReveal }),
  setRenderAnchor: (renderAnchor) => update({ renderAnchor }),
  setDisplay: (displayId) => update({ displayId }),
  /** 首次启动时写入内置扩展；数据库里已有同名文档（比如别的设备同步过来）就跳过 */
  seedExtensions(builtins) {
    let changed = false
    for (const ext of builtins) {
      const existing = utools.db.get(EXT_PREFIX + ext.id)
      if (!existing && !state.seeded) {
        utools.db.put({ _id: EXT_PREFIX + ext.id, ...extDoc(ext), builtin: true })
        changed = true
      } else if (existing && existing.builtin && !String(existing.code).includes('defineWidget')) {
        // 旧版的内置扩展（直接写 HTML 的写法）升级成新写法；用户自己的扩展不动
        utools.db.put({ _id: existing._id, _rev: existing._rev, ...extDoc(ext), builtin: true })
        log('builtin-upgraded', { id: ext.id })
        changed = true
      }
    }
    if (!changed && state.seeded) return
    extensions = loadExtensions()
    if (state.seeded) emit()
    else update({ seeded: true })
  },
  /** 新建或保存扩展，返回扩展 id */
  saveExtension(ext) {
    const id = ext.id || randomUUID()
    const existing = utools.db.get(EXT_PREFIX + id)
    const result = utools.db.put({
      _id: EXT_PREFIX + id,
      ...(existing ? { _rev: existing._rev, builtin: existing.builtin } : {}),
      ...extDoc(ext),
    })
    if (result.error) throw new Error(result.message || '保存失败')
    extensions = loadExtensions()
    emit()
    return id
  },
  /** 删除扩展，同时取下绳上它的所有实例 */
  removeExtension(id) {
    utools.db.remove(EXT_PREFIX + id)
    extensions = loadExtensions()
    const { [id]: _removed, ...extErrors } = state.extErrors
    state = { ...state, extErrors }
    update({ items: state.items.filter((it) => !(it.type === 'widget' && it.ext === id)) })
  },
  hangWidget: (ext) => hang([widgetItem(ext)]),
  addTodo(text) {
    const item = todoItem(text)
    if (item) hang([item])
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
  /** 取下所有图片、便签、文件和空夹子，挂件留着 */
  clearItems() {
    for (const it of state.items) removeOwnedFile(it)
    update({ items: state.items.filter((it) => it.type === 'widget') })
  },
  clearExtErrors(ext) {
    const { [ext]: _removed, ...rest } = state.extErrors
    update({ extErrors: rest })
  },
  /** 守护任务是否已创建（用户在 uTools 里同意过） */
  hasKeepAlive() {
    try {
      return utools.getSchedules().some((s) => s.code === KEEPALIVE)
    } catch {
      return false
    }
  },
  /** 申请每分钟触发一次的守护任务，最终是否创建由用户决定 */
  async requestKeepAlive() {
    await utools.requestSchedule({ code: KEEPALIVE, label: '晾衣绳：被结束后自动恢复', trigger: { cron: '* * * * *' } })
    log('keepalive-request', { created: window.services.hasKeepAlive() })
    return window.services.hasKeepAlive()
  },
  removeKeepAlive() {
    try {
      utools.removeSchedule(KEEPALIVE)
    } catch {}
    log('keepalive-remove')
  },
  /** 开发模式下打开悬浮层的开发者工具 */
  openOverlayDevTools() {
    if (overlay && !overlay.win.isDestroyed()) overlay.win.webContents.openDevTools({ mode: 'detach' })
  },
}
