// 插件应用主界面 preload：晾衣绳状态的唯一持有者
// - 状态与图片存插件应用本地数据目录（屏幕 ID、截图都只属于这台设备，见官方文档「数据存储 / 应用数据」）
// - 管理悬浮层自定义窗口：只开在一块屏幕上，屏幕拔掉时回退到主屏
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { ipcRenderer, clipboard } = require('electron')
const caps = require('./capabilities.js')
const BUILTIN_EXTENSIONS = require('./builtin_extensions.js')

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'svg']
const CONTENT_TYPES = ['image', 'note', 'file']
const DISPLAY_POLL_MS = 2000
/** 两件东西之间的默认间距（px），与悬浮层 layout.ts 的 SPACING 一致 */
const SPACING = 174
/** 夹子能放的范围（占绳长的比例），两端留出淡出区 */
const X_MIN = 0.04
const X_MAX = 0.96

const dataDir = caps.dataDir()
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

/**
 * 旧版 uTools 没有插件应用本地数据目录，数据存在退回目录里（见 capabilities.js）；
 * 升级后第一次启动、新目录还没有数据时搬过来。state 里图片存的是绝对路径，一起改写。
 */
function migrateDataDir() {
  if (caps.dataDir.support() !== 'getPluginLocalDataPath' || fs.existsSync(stateFile)) return
  for (const from of caps.fallbackDataDirs()) {
    const oldState = path.join(from, 'state.json')
    if (from === dataDir || !fs.existsSync(oldState)) continue
    try {
      fs.mkdirSync(dataDir, { recursive: true })
      fs.cpSync(from, dataDir, { recursive: true, force: false })
      const text = fs.readFileSync(oldState, 'utf-8')
      fs.writeFileSync(stateFile, text.split(JSON.stringify(from).slice(1, -1)).join(JSON.stringify(dataDir).slice(1, -1)), 'utf-8')
      log('data-migrated', { from })
    } catch (err) {
      log('data-migrate-failed', { from, message: String(err && err.message) })
    }
    return
  }
}
migrateDataDir()
log('capabilities', caps.report().map((r) => `${r.name}=${r.using}`))

const defaultState = {
  enabled: true,
  /** auto：鼠标碰到屏幕顶边时滑出；pinned：常驻 */
  mode: 'auto',
  /** 用户选择的屏幕；null 表示主屏 */
  displayId: null,
  /** 每块屏幕一根晾衣绳（每根各挂各的）；关着时只有选中屏幕上的一根 */
  multiLine: false,
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
    /** none 不截图 / copy 复制 / hang 挂到晾衣绳 / both 复制并挂上（默认：和晾衣绳联动） */
    output: 'both',
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
    /** 铺地毯的屏幕 id；空表示跟着晾衣绳那块屏幕 */
    displays: [],
  },
  /** 渲染保活点：悬浮层持续小幅重绘，避免拉下后不显示 */
  renderAnchor: true,
  /** 试验：用户拉下晾衣绳时让悬浮层获得焦点，换取正常的渲染帧率，代价是抢走当前窗口的键盘焦点 */
  focusOnReveal: false,
  /** 快速添加待办的目标卡片 id；null 表示最新的一张 */
  todoTarget: null,
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
    // 旧版本的待办是一张卡片一条：转成一张卡片多行
    state.items = state.items.map((it) =>
      it.type === 'todo' && !Array.isArray(it.lines)
        ? { ...it, lines: it.text ? [{ id: it.id + '-1', text: it.text, done: false }] : [], color: it.color || 'amber' }
        : it,
    )
    // 旧版本的时钟类型改成「时钟」挂件扩展的实例
    state.items = state.items.map((it) => (it.type === 'clock' ? { ...it, type: 'widget', ext: 'clock' } : it))
    return state
  } catch {
    return { ...defaultState, items: [...defaultState.items] }
  }
}

let state = loadState()
const listeners = new Set()

const builtinOf = (id) => BUILTIN_EXTENSIONS.find((b) => b.id === id)

/**
 * 旧版本首次启动时把内置扩展抄了一份进数据库：没改过的删掉，改过的标成 customized 继续覆盖内置版本。
 * 只看 builtin 且没有 customized 标记的文档，所以只会动一次
 */
function migrateSeededBuiltins() {
  for (const d of utools.db.allDocs(EXT_PREFIX)) {
    const b = d.builtin && !d.customized && builtinOf(d._id.slice(EXT_PREFIX.length))
    if (!b) continue
    const untouched = String(d.code).trim() === b.code.trim() || !String(d.code).includes('defineWidget')
    if (untouched) utools.db.remove(d)
    else utools.db.put({ ...d, customized: true })
    log('builtin-migrated', { id: b.id, untouched })
  }
}

/** 内置扩展（改过的用数据库里的版本）在前，用户自己的扩展在后 */
function loadExtensions() {
  const docs = utools.db.allDocs(EXT_PREFIX).map((d) => ({
    id: d._id.slice(EXT_PREFIX.length),
    name: d.name,
    code: d.code,
    width: d.width,
    height: d.height,
    settings: d.settings,
    builtin: !!builtinOf(d._id.slice(EXT_PREFIX.length)),
    customized: !!d.customized,
    updatedAt: d.updatedAt,
  }))
  const builtins = BUILTIN_EXTENSIONS.map((b) => docs.find((d) => d.id === b.id && d.customized) || { ...b, builtin: true })
  return [...builtins, ...docs.filter((d) => !builtinOf(d.id))]
}

try {
  migrateSeededBuiltins()
} catch (err) {
  log('builtin-migrate-failed', String(err && err.message))
}

let extensions = loadExtensions()

/**
 * 悬浮层：每块需要的屏幕一个，displayId → { win, displayId, ready, shown, pending, idleTimer }
 * - 挂晾衣绳的屏幕（默认只有选中的那块，打开「每块屏幕一根晾衣绳」后是全部）
 * - 别的屏幕上发信号时临时开一个只用来发信号的悬浮层，一段时间不用就关掉，平时不占资源
 * 窗口都一样，挂不挂晾衣绳由推送的状态（role）决定，切换不用重开窗口
 */
const overlays = new Map()
/** 只用来发信号的悬浮层多久不用就关掉（ms） */
const PING_OVERLAY_IDLE_MS = 60 * 1000
let displayTimer = null
/** 桌面地毯窗口：displayId → { win, key, shown }，key 是打开它时用的参数，参数变了就重开 */
const rugs = new Map()
/** 晾衣绳窗口还没显示出来，地毯等它显示后再建 */
let rugWaiting = false
/** 地毯编辑模式：浮到最上层、可以拖动缩放；平时完全点击穿透 */
let rugEditing = false

/** 拖拽精度 → rug.js 的约束迭代次数和子步数 */
const RUG_PRECISION = { fine: { iter: 8, sub: 3 }, standard: { iter: 6, sub: 2 }, eco: { iter: 4, sub: 2 } }

const alive = (entry) => !!entry && !entry.win.isDestroyed()

/** 进入 / 退出地毯编辑模式（所有屏幕上的地毯一起） */
function setRugEditing(on) {
  const live = [...rugs.values()].filter(alive)
  if (on && (!state.rug.enabled || !live.length)) {
    utools.showNotification('先在设置里打开桌面地毯')
    return
  }
  rugEditing = on
  log('rug-edit', { on, rugs: live.length })
  for (const { win } of live) {
    win.webContents.send('rug:edit', on)
    if (on) {
      // 浮到最上层，地毯上的点击由页面按地毯轮廓决定接不接收
      win.setAlwaysOnTop(true)
      win.setIgnoreMouseEvents(true, { forward: true })
      win.showInactive()
      win.moveTop()
    } else {
      // 退出编辑：取消置顶，地毯照常可以直接拖动（不再用 blur() 推到底层）
      win.setAlwaysOnTop(false)
      win.setIgnoreMouseEvents(true, { forward: true })
    }
  }
  emit()
}

function closeRug(displayId, reason) {
  const entry = rugs.get(displayId)
  rugs.delete(displayId)
  if (!entry) return
  log('rug-close', { display: displayId, reason })
  if (!entry.win.isDestroyed()) entry.win.destroy()
}

function closeAllRugs(reason) {
  rugEditing = false
  for (const id of [...rugs.keys()]) closeRug(id, reason)
}

/** 铺地毯的屏幕：设置里选的（已经拔掉的跳过）；一块都没选或都不在了，就铺在晾衣绳那块屏幕上 */
function rugDisplays() {
  const all = utools.getAllDisplays()
  const chosen = (state.rug.displays || []).map((id) => all.find((d) => d.id === id)).filter(Boolean)
  return chosen.length ? chosen : [resolveDisplay().display]
}

/** 主晾衣绳的悬浮层是否已经显示出来 */
function mainOverlayShown() {
  const entry = overlays.get(resolveDisplay().display.id)
  return alive(entry) && entry.shown
}

/**
 * 地毯窗口：普通层级、不置顶，显示后推到最底层。
 * 这样它在桌面图标之上，而任何应用窗口被点到前面时都会盖住它（Electron 没法像原版那样设到「桌面图标层 + 1」）
 */
function syncRug() {
  if (!state.rug.enabled) return closeAllRugs('disabled')
  // 晾衣绳窗口还没显示：等它显示后再建，免得两个窗口同时创建
  if (state.enabled && !mainOverlayShown()) {
    rugWaiting = true
    return
  }
  const wanted = rugDisplays()
  for (const id of [...rugs.keys()]) if (!wanted.some((d) => d.id === id)) closeRug(id, 'display-removed')
  const p = RUG_PRECISION[state.rug.precision] || RUG_PRECISION.standard
  for (const display of wanted) {
    const { bounds } = display
    // 花样在地毯里切换后只是存下来，不需要重开窗口
    const key = `${bounds.x},${bounds.y},${bounds.width}x${bounds.height}|${state.rug.quality}|${state.rug.precision}`
    const existing = rugs.get(display.id)
    if (alive(existing) && existing.key === key) continue
    closeRug(display.id, 'reopen')
    const query = new URLSearchParams({
      material: state.rug.material,
      quality: state.rug.quality,
      iter: String(p.iter),
      sub: String(p.sub),
      lang: 'zh-Hans',
      bx: String(bounds.x),
      by: String(bounds.y),
      display: String(display.id),
    })
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
    rugs.set(display.id, entry)
  }
}

/** 把地毯显示出来（同 presentOverlay：创建回调和页面报到谁先到谁执行） */
function presentRug(entry, via) {
  if (entry.shown || entry.win.isDestroyed()) return
  entry.shown = true
  const { win } = entry
  log('rug-shown', { via })
  // 地毯以外点击穿透；鼠标在地毯上时由页面按地毯轮廓打开接收（随时可以直接拖、掀、折）
  win.setIgnoreMouseEvents(true, { forward: true })
  try {
    win.setVisibleOnAllWorkspaces(true)
  } catch {}
  // 不调用 blur() 推到最底层：macOS 上它是先隐藏再放到底层，之后点击能到窗口、地毯却可能不再响应。
  // 地毯是普通层级窗口，其他应用被激活时它们的窗口会回到地毯上面
  win.showInactive()
}

/** 在所有地毯里执行一段脚本（换花样、复位） */
function eachRug(script) {
  for (const entry of rugs.values()) if (alive(entry)) void entry.win.webContents.executeJavaScript(script)
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
    multiLine: state.multiLine,
    rug: state.rug,
    rugEditing,
    todoTarget: state.todoTarget,
    items: viewItems(),
    extensions,
  }
}

/** 发给某块屏幕上的悬浮层；还没准备好就先存着，就绪后按顺序补发 */
function sendTo(displayId, channel, ...args) {
  const entry = overlays.get(displayId)
  if (!alive(entry)) return false
  if (entry.ready) entry.win.webContents.send(channel, ...args)
  else entry.pending.push([channel, args])
  return true
}

/** 发给所有挂晾衣绳的悬浮层 */
function sendToLines(channel, ...args) {
  for (const display of lineDisplays()) sendTo(display.id, channel, ...args)
}

/** 挂晾衣绳的屏幕：默认只有选中的那块；打开「每块屏幕一根晾衣绳」后是全部 */
function lineDisplays() {
  if (!state.enabled) return []
  const main = resolveDisplay().display
  if (!state.multiLine) return [main]
  // 主晾衣绳放第一个，地毯等它显示出来再建
  return [main, ...utools.getAllDisplays().filter((d) => d.id !== main.id)]
}

/** 这件东西挂在哪块屏幕的晾衣绳上：只有一根绳子时都在主绳上；所在屏幕拔掉了也回到主绳 */
function itemDisplayId(it, lines = lineDisplays()) {
  const main = resolveDisplay().display.id
  if (!state.multiLine || it.displayId == null) return main
  return lines.some((d) => d.id === it.displayId) ? it.displayId : main
}

function pushToOverlay() {
  const lines = lineDisplays()
  const all = utools.getAllDisplays()
  const items = viewItems()
  for (const [id, entry] of overlays) {
    const display = all.find((d) => d.id === id)
    if (!display || !alive(entry) || !entry.ready) continue
    const line = lines.some((d) => d.id === id)
    entry.win.webContents.send('overlay:state', {
      // ping：这块屏幕上只用来发信号，不显示晾衣绳
      role: line ? 'line' : 'ping',
      mode: state.mode,
      items: line ? items.filter((it) => itemDisplayId(it, lines) === id) : [],
      bounds: display.bounds,
      // macOS 菜单栏、顶部任务栏占掉的高度，绳子挂在它下面
      topInset: display.workArea.y - display.bounds.y,
      notch: hasNotch(display),
      handle: state.handle || (hasNotch(display) ? 'right' : 'center'),
      hideDelay: state.hideDelay,
      extensions,
      debug: state.debugHud && utools.isDev(),
      // 只发信号的悬浮层用完就关，不需要保活重绘
      renderAnchor: line && state.renderAnchor,
      ping: state.ping,
    })
  }
}

function emit() {
  const snap = snapshot()
  for (const l of listeners) l(snap)
  pushToOverlay()
}

function closeOverlay(displayId, reason) {
  const entry = overlays.get(displayId)
  overlays.delete(displayId)
  if (!entry) return
  log('overlay-close', { display: displayId, reason })
  clearTimeout(entry.idleTimer)
  if (!entry.win.isDestroyed()) entry.win.destroy()
}

function closeAllOverlays(reason) {
  for (const id of [...overlays.keys()]) closeOverlay(id, reason)
}

function openOverlay(display) {
  log('overlay-open', { display: display.id, bounds: display.bounds, workAreaY: display.workArea.y })
  const { bounds } = display
  // Windows 下使用 fullscreen 避免窗口尺寸限制（见官方文档「全屏透明置顶窗口」）
  const fullscreenable = utools.isWindows()
  const entry = { win: null, displayId: display.id, ready: false, shown: false, pending: [], idleTimer: 0 }
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
      acceptFirstMouse: true,
      // 官方文档「全屏透明置顶窗口 / 性能注意」：透明窗口可能被降低渲染优先级，backgroundThrottling 能缓解一部分
      webPreferences: { preload: 'overlay_preload.js', backgroundThrottling: false },
    },
    () => presentOverlay(entry, 'callback'),
  )
  overlays.set(display.id, entry)
  return entry
}

/**
 * 把悬浮层显示出来。创建回调和页面报到（overlay:ready）谁先到谁执行，只执行一次：
 * 两个自定义窗口几乎同时创建时，先建的那个的回调可能不会被调用，窗口就一直停在隐藏状态
 */
function presentOverlay(entry, via) {
  if (entry.shown || entry.win.isDestroyed()) return
  entry.shown = true
  const { win } = entry
  log('overlay-shown', { display: entry.displayId, via })
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
  // 还有屏幕没开晾衣绳（每块屏幕一根时）：这个显示出来了再开下一个
  if (lineDisplays().some((d) => !overlays.has(d.id))) syncOverlay()
  // 等晾衣绳显示出来再建地毯窗口，两个窗口不要同时创建
  if (rugWaiting && mainOverlayShown()) {
    rugWaiting = false
    syncRug()
  }
}

/** 只用来发信号的悬浮层：每次用到都重新计时，一段时间不用就关掉 */
function touchPingOverlay(entry) {
  clearTimeout(entry.idleTimer)
  entry.idleTimer = setTimeout(() => {
    if (!lineDisplays().some((d) => d.id === entry.displayId)) closeOverlay(entry.displayId, 'ping-idle')
  }, PING_OVERLAY_IDLE_MS)
}

/** 让悬浮层与当前状态、屏幕布局一致 */
function syncOverlay() {
  const lines = lineDisplays()
  const all = utools.getAllDisplays()
  for (const [id, entry] of [...overlays]) {
    if (entry.win.isDestroyed()) closeOverlay(id, 'destroyed')
    else if (!all.some((d) => d.id === id)) closeOverlay(id, 'display-removed')
    // 不再挂晾衣绳的屏幕：没在发信号就关掉，在发信号的等它空闲后关
    else if (!lines.some((d) => d.id === id) && !entry.idleTimer) closeOverlay(id, state.enabled ? 'line-removed' : 'disabled')
  }
  // 临时发信号的悬浮层变成挂晾衣绳的：不再按空闲关闭
  for (const display of lines) {
    const entry = overlays.get(display.id)
    if (entry && entry.idleTimer) {
      clearTimeout(entry.idleTimer)
      entry.idleTimer = 0
    }
  }
  // 晾衣绳逐个打开：先开主绳，显示出来后再开下一个，免得几个窗口同时创建
  for (const display of lines) {
    if (overlays.has(display.id)) continue
    if ([...overlays.values()].some((e) => !e.shown)) break
    openOverlay(display)
    break
  }
  pushToOverlay()
}

/** 在某块屏幕上用悬浮层发信号：这块屏幕没有悬浮层就临时开一个 */
function pingOn(display, channel, payload) {
  let entry = overlays.get(display.id)
  if (!alive(entry)) entry = openOverlay(display)
  if (!lineDisplays().some((d) => d.id === display.id)) touchPingOverlay(entry)
  sendTo(display.id, channel, payload)
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
      closeAllOverlays('displays-changed')
      closeAllRugs('displays-changed')
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

/** 某块屏幕的晾衣绳上挂着的东西 */
function itemsOn(displayId, items = state.items) {
  const lines = lineDisplays()
  return items.filter((it) => itemDisplayId(it, lines) === displayId)
}

/** 绳上最大的空当的中点，新东西挂那里 */
function freeX(displayId) {
  const xs = itemsOn(displayId).map((it) => it.x).sort((a, b) => a - b)
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

/** 超出上限的东西（每根绳子各算各的）：最旧的掉下去 */
function overflowIds(items, maxItems) {
  const lines = lineDisplays()
  const dropped = new Set()
  for (const display of lines.length ? lines : [resolveDisplay().display]) {
    const content = items
      .filter((it) => CONTENT_TYPES.includes(it.type) && itemDisplayId(it, lines) === display.id)
      .sort((a, b) => b.createdAt - a.createdAt)
    for (const it of content.slice(maxItems)) dropped.add(it.id)
  }
  return dropped
}

/**
 * 挂上新东西
 * @param at.x 指定位置（占绳长的比例），不给就挂在最大空当
 * @param at.clipId 挂到这个空夹子上，夹子被替换
 * @param at.displayId 挂到哪块屏幕的晾衣绳上，不给就挂主绳（挂到夹子上时跟着夹子）
 */
function hang(newItems, at = {}) {
  if (!newItems.length) return
  let items = state.items
  let x = at.x
  let displayId = at.displayId ?? resolveDisplay().display.id
  if (at.clipId) {
    const clip = items.find((it) => it.id === at.clipId)
    if (clip) {
      x = clip.x
      displayId = itemDisplayId(clip)
    }
    items = items.filter((it) => it.id !== at.clipId)
  }
  state = { ...state, items }
  const display = utools.getAllDisplays().find((d) => d.id === displayId) || resolveDisplay().display
  const step = SPACING / display.bounds.width
  const start = x ?? freeX(display.id)
  const placed = newItems.map((it, i) => ({ ...it, displayId: display.id, x: clampX(start + i * step) }))
  items = [...placed, ...items]
  // 超出上限：最旧的掉下去，我们自己保存的图片顺手删掉
  const dropped = overflowIds(items, state.maxItems)
  for (const it of items) if (dropped.has(it.id)) removeOwnedFile(it)
  update({ items: items.filter((it) => !dropped.has(it.id)) })
  sendTo(itemDisplayId(placed[0]), 'overlay:peek')
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

/** 待办：每行最多几个字、每张卡片最多几行，与前端 TODO_MAX / TODO_LINES 一致 */
const TODO_MAX = 30
const TODO_LINES = 6
const TODO_COLORS = ['amber', 'rose', 'sky', 'emerald', 'violet']

const todoText = (text) => Array.from(String(text).replace(/\s+/g, ' ').trim()).slice(0, TODO_MAX).join('')
const todoLine = (text) => ({ id: randomUUID(), text, done: false })

/** 新建一张待办卡片（可以先不带内容） */
function todoCard(text) {
  const t = text ? todoText(text) : ''
  return { id: randomUUID(), type: 'todo', lines: t ? [todoLine(t)] : [], color: 'amber', createdAt: Date.now() }
}

/** 快速添加的目标卡片：设置里指定的那张，没指定就用最新的一张 */
function todoTarget() {
  const cards = state.items.filter((it) => it.type === 'todo')
  return cards.find((c) => c.id === state.todoTarget) || cards.sort((a, b) => b.createdAt - a.createdAt)[0] || null
}

function updateTodo(id, fn) {
  update({ items: state.items.map((it) => (it.id === id && it.type === 'todo' ? fn(it) : it)) })
}

/** 往卡片里加一行；满了不自动新建，提示去设置里新建。返回是否加上了 */
function addTodoLine(text, cardId) {
  const t = todoText(text)
  if (!t) return false
  const card = cardId ? state.items.find((it) => it.id === cardId && it.type === 'todo') : todoTarget()
  // 一张卡片都没有：这是第一张，直接建
  if (!card) {
    hang([todoCard(t)])
    return true
  }
  if (card.lines.length >= TODO_LINES) {
    utools.showNotification(`这张待办卡已经有 ${TODO_LINES} 条了，可以在设置的「待办」里新建一张`)
    return false
  }
  updateTodo(card.id, (c) => ({ ...c, lines: [...c.lines, todoLine(t)] }))
  sendTo(itemDisplayId(card), 'overlay:peek')
  return true
}

/** 勾选 / 取消勾选：只标记完成，不删除 */
function toggleTodoLine(cardId, lineId) {
  updateTodo(cardId, (c) => ({ ...c, lines: c.lines.map((l) => (l.id === lineId ? { ...l, done: !l.done } : l)) }))
}

/** 一键完成：整张卡片的条目都标成已完成 */
function completeTodoCard(cardId) {
  updateTodo(cardId, (c) => ({ ...c, lines: c.lines.map((l) => ({ ...l, done: true })) }))
}

/** 改一行的完成状态或文字（MCP 用；界面上只有勾选切换） */
function updateTodoLine(cardId, lineId, patch) {
  updateTodo(cardId, (c) => ({ ...c, lines: c.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }))
}

/** 删除一行；最后一行也删了就把卡片取下 */
function removeTodoLine(cardId, lineId) {
  const card = state.items.find((it) => it.id === cardId && it.type === 'todo')
  if (!card) return
  const lines = card.lines.filter((l) => l.id !== lineId)
  if (lines.length) updateTodo(cardId, (c) => ({ ...c, lines }))
  else update({ items: state.items.filter((it) => it.id !== cardId), todoTarget: state.todoTarget === cardId ? null : state.todoTarget })
}

/** 新建一张待办卡片并设为快速添加的目标，返回这张卡片 */
function newTodoCard(text) {
  const card = todoCard(text)
  state = { ...state, todoTarget: card.id }
  hang([card])
  return state.items.find((it) => it.id === card.id) || card
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

// 悬浮层、地毯发来的消息第一个参数都是它所在的屏幕 id（见 overlay_preload.js / rug_preload.js）

ipcRenderer.on('overlay:ready', (_e, from) => {
  log('overlay-ready', { display: from })
  const entry = overlays.get(from)
  if (!alive(entry)) return
  entry.ready = true
  presentOverlay(entry, 'ready')
  pushToOverlay()
  // 悬浮层还没准备好时发来的信号、轮盘请求
  for (const [channel, args] of entry.pending) entry.win.webContents.send(channel, ...args)
  entry.pending = []
  // 刚打开时先滑下来露个面，让用户知道绳子在哪
  if (lineDisplays().some((d) => d.id === from)) sendTo(from, 'overlay:peek')
})

ipcRenderer.on('overlay:interactive', (_e, from, interactive) => {
  const entry = overlays.get(from)
  if (alive(entry)) entry.win.setIgnoreMouseEvents(!interactive, { forward: true })
})

ipcRenderer.on('overlay:repaint', (_e, from) => {
  const entry = overlays.get(from)
  if (alive(entry)) entry.win.webContents.invalidate()
})

ipcRenderer.on('overlay:remove', (_e, _from, id) => {
  window.services.removeItem(id)
})

ipcRenderer.on('overlay:move', (_e, _from, id, x) => {
  update({ items: state.items.map((it) => (it.id === id ? { ...it, x: clampX(x) } : it)) })
})

ipcRenderer.on('overlay:add-clip', (_e, from, x) => {
  update({ items: [...state.items, { id: randomUUID(), type: 'clip', displayId: from, x: clampX(x), createdAt: Date.now() }] })
})

ipcRenderer.on('overlay:fill-clip', async (_e, _from, clipId, source) => {
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

ipcRenderer.on('overlay:drop', (_e, from, paths, x, clipId) => {
  hang(fileItems(paths), clipId ? { clipId } : { x, displayId: from })
})

// 挂件 api.storage 的数据：只落盘，不广播（挂件自己已经有最新数据，广播会让它重建）
ipcRenderer.on('overlay:widget-data', (_e, _from, id, data) => {
  state = { ...state, items: state.items.map((it) => (it.id === id ? { ...it, data } : it)) }
  saveState()
})

// 空夹子上点「待办」：在这个位置主动新建一张卡片
ipcRenderer.on('overlay:add-todo', (_e, from, text, clipId) => {
  const t = todoText(text)
  if (t) hang([todoCard(t)], clipId ? { clipId } : { displayId: from })
})

ipcRenderer.on('overlay:todo-toggle', (_e, _from, cardId, lineId) => toggleTodoLine(cardId, lineId))
ipcRenderer.on('overlay:todo-delete', (_e, _from, cardId, lineId) => removeTodoLine(cardId, lineId))
ipcRenderer.on('overlay:todo-complete', (_e, _from, cardId) => completeTodoCard(cardId))
ipcRenderer.on('overlay:todo-add', (_e, _from, cardId, text) => addTodoLine(text, cardId))

// 在夹子上直接写待办时需要键盘焦点，这会把 uTools 切到前台
ipcRenderer.on('overlay:focus', (_e, from) => {
  const entry = overlays.get(from)
  if (alive(entry)) entry.win.focus()
})

// 信号截图：静默截取发信号的那块屏幕，按 DIP 矩形裁出一块（截图是物理像素，要按实际比例换算）
ipcRenderer.on('overlay:ping-capture', async (_e, from, reqId, rect) => {
  try {
    const display = utools.getAllDisplays().find((d) => d.id === from) || utools.getDisplayMatching(rect)
    const [shot] = await caps.captureDisplay({ displayId: display.id })
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
    sendTo(from, 'overlay:ping-captured', reqId, { dataUrl: img.crop(crop).toDataURL(), scale })
  } catch (err) {
    log('ping-capture-failed', String(err && err.message))
    sendTo(from, 'overlay:ping-captured', reqId, { error: String(err && err.message) })
  }
})

// 叠好图标的截图：按设置复制和 / 或挂到晾衣绳（这块屏幕有晾衣绳就挂这根，没有就挂主绳）
ipcRenderer.on('overlay:ping-result', (_e, from, dataUrl) => {
  const output = state.ping.output
  if (output === 'copy' || output === 'both') utools.copyImage(dataUrl)
  if (output === 'hang' || output === 'both') {
    const onLine = lineDisplays().some((d) => d.id === from)
    hang([imageItem(dataUrl)], onLine ? { displayId: from } : {})
  }
})

// 挂件报错：同一条连着出现只累加次数；落盘和通知设置页都节流，挂件疯狂报错也不会拖慢插件
let errorFlush = 0
ipcRenderer.on('overlay:widget-error', (_e, _from, ext, message, line, fatal) => {
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

ipcRenderer.on('overlay:focus-on-reveal', (_e, from) => {
  const entry = overlays.get(from)
  if (!state.focusOnReveal || !alive(entry)) return
  entry.win.focus()
  log('focus-on-reveal')
})

ipcRenderer.on('overlay:notify', (_e, _from, text) => {
  utools.showNotification(String(text).slice(0, 200))
})

log('preload-start', { enabled: state.enabled, mode: state.mode, multiLine: state.multiLine })

utools.onPluginOut((isKill) => {
  log('plugin-out', { isKill })
})

// 鼠标在地毯（或编辑工具栏）上时接收，其余点击穿透
ipcRenderer.on('rug:accept', (_e, from, accept) => {
  const entry = rugs.get(from)
  if (alive(entry)) entry.win.setIgnoreMouseEvents(!accept, { forward: true })
})

ipcRenderer.on('rug:ready', (_e, from) => {
  const entry = rugs.get(from)
  if (!alive(entry)) return
  presentRug(entry, 'ready')
  // 页面重新加载过（比如 WebGL 上下文丢失后恢复）：还在编辑就让它重新进入编辑
  if (rugEditing) entry.win.webContents.send('rug:edit', true)
})

ipcRenderer.on('rug:end-edit', () => setRugEditing(false))

ipcRenderer.on('rug:back', (_e, from) => {
  const entry = rugs.get(from)
  if (alive(entry)) entry.win.blur()
  log('rug-back', { display: from })
})

// 一张地毯换了花样：存下来，其他屏幕上的地毯也换成一样的
ipcRenderer.on('rug:material', (_e, from, id) => {
  // 地毯被设成某个花样后也会报上来（包括这里让它换的）：和现在一样就不再转发，否则两张地毯会来回互相触发
  if (String(id) === state.rug.material) return
  log('rug-material', id)
  state = { ...state, rug: { ...state.rug, material: String(id) } }
  saveState()
  for (const [displayId, entry] of rugs) {
    if (displayId !== from && alive(entry)) void entry.win.webContents.executeJavaScript(`window.rugSetMaterial && window.rugSetMaterial(${JSON.stringify(String(id))}, true)`)
  }
  emit()
})

// 地毯上的垃圾桶：只收起这一张；最后一张也收起了就关掉地毯
ipcRenderer.on('rug:hide', (_e, from) => {
  const left = rugDisplays()
    .map((d) => d.id)
    .filter((id) => id !== from)
  if (!left.length || !(state.rug.displays || []).length) update({ rug: { ...state.rug, enabled: false } })
  else update({ rug: { ...state.rug, displays: left } })
})

// 守护任务触发：插件刚被拉起来时直接重开悬浮层，不依赖设置页
caps.onScheduleTrigger(({ code }) => {
  if (code !== KEEPALIVE) return
  if (!mainOverlayShown()) log('keepalive-restore')
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
  /** 在光标位置弹出信号轮盘：光标在哪块屏幕就在哪块屏幕上发 */
  ping() {
    if (!state.enabled) update({ enabled: true })
    const point = utools.getCursorScreenPoint()
    pingOn(utools.getDisplayNearestPoint(point), 'overlay:ping-open', point)
  },
  setPing: (patch) => update({ ping: { ...state.ping, ...patch } }),
  setRug(patch) {
    update({ rug: { ...state.rug, ...patch } })
    // 换花样不重开窗口，直接让地毯换
    if (patch.material) eachRug(`window.rugSetMaterial && window.rugSetMaterial(${JSON.stringify(patch.material)}, true)`)
  },
  /** 进入地毯编辑模式：收起 uTools 面板，地毯浮到最上层，屏幕上方出现编辑工具栏 */
  editRug() {
    utools.hideMainWindow()
    setRugEditing(true)
  },
  /** 地毯放回屏幕中间并摊平（每块屏幕上的都复位） */
  resetRug() {
    eachRug('window.rugReset && window.rugReset()')
  },
  pingHotKey: () => caps.getCmdHotKey('发信号') ?? null,
  setPingHotKey: () => utools.redirectHotKeySetting('发信号'),
  /** 把晾衣绳拉下来一会儿 */
  peek() {
    if (!state.enabled) update({ enabled: true })
    sendToLines('overlay:peek', 4000)
  },
  setEnabled: (enabled) => update({ enabled }),
  setMode: (mode) => update({ mode }),
  setHandle: (handle) => update({ handle }),
  setHideDelay: (hideDelay) => update({ hideDelay }),
  setDebugHud: (debugHud) => update({ debugHud }),
  setFocusOnReveal: (focusOnReveal) => update({ focusOnReveal }),
  setRenderAnchor: (renderAnchor) => update({ renderAnchor }),
  setDisplay: (displayId) => update({ displayId }),
  setMultiLine: (multiLine) => update({ multiLine }),
  /** 内置案例扩展（给 AI 写挂件时当示例） */
  builtinExtensions: () => BUILTIN_EXTENSIONS,
  /** 新建或保存扩展，返回扩展 id */
  saveExtension(ext) {
    const id = ext.id || randomUUID()
    const existing = utools.db.get(EXT_PREFIX + id)
    const result = utools.db.put({
      _id: EXT_PREFIX + id,
      ...(existing ? { _rev: existing._rev } : {}),
      // 改内置扩展：存一份覆盖内置版本
      ...(builtinOf(id) ? { builtin: true, customized: true } : {}),
      ...extDoc(ext),
    })
    if (result.error) throw new Error(result.message || '保存失败')
    extensions = loadExtensions()
    emit()
    return id
  },
  /** 删除扩展，同时取下绳上它的所有实例；内置扩展删不掉，只是删掉改过的那份、恢复默认 */
  removeExtension(id) {
    const doc = utools.db.get(EXT_PREFIX + id)
    if (doc) utools.db.remove(doc)
    if (builtinOf(id)) {
      extensions = loadExtensions()
      emit()
      return
    }
    extensions = loadExtensions()
    const { [id]: _removed, ...extErrors } = state.extErrors
    state = { ...state, extErrors }
    update({ items: state.items.filter((it) => !(it.type === 'widget' && it.ext === id)) })
  },
  hangWidget: (ext) => hang([widgetItem(ext)]),
  /** 快速添加一条待办（uTools 指令、设置页）：加到目标卡片里 */
  addTodo: (text) => addTodoLine(text),
  addTodoLine: (cardId, text) => addTodoLine(text, cardId),
  removeTodoLine,
  toggleTodoLine,
  completeTodoCard,
  /** 主动新建一张待办卡片，并设为快速添加的目标 */
  newTodoCard(text) {
    newTodoCard(text)
  },
  setTodoTarget: (todoTarget) => update({ todoTarget }),
  setTodoColor(cardId, color) {
    if (TODO_COLORS.includes(color)) updateTodo(cardId, (c) => ({ ...c, color }))
  },
  setMaxItems(maxItems) {
    const dropped = overflowIds(state.items, maxItems)
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
  /** 当前 uTools 支不支持定时任务（旧版没有，设置页隐藏「保持显示」） */
  keepAliveSupported: () => caps.requestSchedule.support() !== false,
  /** 守护任务是否已创建（用户在 uTools 里同意过） */
  hasKeepAlive() {
    try {
      return caps.getSchedules().some((s) => s.code === KEEPALIVE)
    } catch {
      return false
    }
  },
  /** 申请每分钟触发一次的守护任务，最终是否创建由用户决定 */
  async requestKeepAlive() {
    await caps.requestSchedule({ code: KEEPALIVE, label: '晾衣绳：被结束后自动恢复', trigger: { cron: '* * * * *' } })
    log('keepalive-request', { created: window.services.hasKeepAlive() })
    return window.services.hasKeepAlive()
  },
  removeKeepAlive() {
    try {
      caps.removeSchedule(KEEPALIVE)
    } catch {}
    log('keepalive-remove')
  },
  /** 开发模式下打开悬浮层的开发者工具 */
  openOverlayDevTools() {
    const entry = overlays.get(resolveDisplay().display.id)
    if (alive(entry)) entry.win.webContents.openDevTools({ mode: 'detach' })
  },
}

// MCP 工具（声明见 plugin.json 的 tools）：插件初始化时注册，AI Agent 调用时不依赖设置页。
// 单独 try，注册失败不影响插件本身
try {
  if (typeof utools.registerTool === 'function') {
    require('./mcp_tools.js').registerMcpTools(utools, {
      state: () => state,
      TODO_LINES,
      todoText,
      todoTarget,
      extensionName: (id) => extensions.find((e) => e.id === id)?.name ?? id,
      fileItems,
      noteItem,
      hang,
      removeItem: (id) => window.services.removeItem(id),
      newTodoCard,
      addTodoLine,
      updateTodoLine,
      completeTodoCard,
      removeTodoLine,
      resolveDisplay,
      cursorPoint: () => utools.getCursorScreenPoint(),
      displayAt: (point) => utools.getDisplayNearestPoint(point),
      displays: () => utools.getAllDisplays(),
      primaryId: () => utools.getPrimaryDisplay().id,
      lineDisplayIds: () => lineDisplays().map((d) => d.id),
      itemDisplayId: (it) => itemDisplayId(it),
      multiLine: () => !!state.multiLine,
      /** 晾衣绳关着时先打开，Agent 挂的东西、发的信号用户才看得见 */
      ensureVisible() {
        if (!state.enabled) update({ enabled: true })
        else syncOverlay()
      },
      /** 直接播放信号：不弹轮盘、不截图；发在这个点所在的屏幕上 */
      firePing(payload) {
        if (!state.enabled) update({ enabled: true })
        pingOn(utools.getDisplayNearestPoint(payload), 'overlay:ping-fire', payload)
      },
    })
  }
} catch (err) {
  log('mcp-register-failed', String(err && err.message))
}
