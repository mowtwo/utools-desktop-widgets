// 挂件扩展的沙箱运行时
//
// 三层隔离，保证挂件出什么问题都拖不垮晾衣绳：
// 1. iframe：sandbox="allow-scripts"（不透明源），碰不到悬浮层的 preload 和本地能力；
//    CSP 只放行带 nonce 的宿主脚本，挂件交出的 HTML 里的 <script>、onclick 等一律不执行
// 2. Worker：用户脚本跑在 iframe 创建的 Worker 线程里，死循环只会卡住自己的线程；
//    宿主每秒探测一次，超时就 terminate，挂件显示「已停止」
// 3. 宿主侧（WidgetFrame）：校验每条消息的参数，限制频率和数据大小

export interface WidgetExtension {
  id: string
  name: string
  code: string
  /** 默认尺寸（px），脚本里可用 api.size / api.fit 调整 */
  width: number
  height: number
  /** 传给脚本的 api.settings，JSON 字符串 */
  settings: string
  builtin?: boolean
  updatedAt?: number
}

export interface HandleContent {
  /** 最多 HANDLE_TEXT_MAX 个字，纯文本 */
  text?: string
  /** 0 ~ 1 */
  progress?: number
}

export type LineOp = 'keepOpen' | 'collapse' | 'reveal' | 'focus'

/** 沙箱发给宿主的消息 */
export type WidgetMessage =
  | { type: 'size'; width: number; height: number }
  | { type: 'data'; data: Record<string, unknown> }
  | { type: 'copy'; text: string }
  | { type: 'open'; url: string }
  | { type: 'notify'; text: string }
  | { type: 'line'; op: LineOp; value?: boolean }
  | { type: 'handle'; value: HandleContent | null }
  | { type: 'error'; message: string; line?: number; fatal?: boolean }

export const WIDGET_MIN = { width: 40, height: 24 }
export const WIDGET_MAX = { width: 320, height: 260 }
export const HANDLE_TEXT_MAX = 12
/** api.storage 的数据上限（JSON 字符数） */
export const DATA_MAX = 32 * 1024
/** api.render 的 HTML 上限（字符数） */
const HTML_MAX = 100 * 1024
/** Worker 多久没回应算卡死（ms） */
const HANG_MS = 3000

export const clampSize = (w: number, h: number) => ({
  width: Math.round(Math.min(WIDGET_MAX.width, Math.max(WIDGET_MIN.width, Number(w) || 0))),
  height: Math.round(Math.min(WIDGET_MAX.height, Math.max(WIDGET_MIN.height, Number(h) || 0))),
})

/** 挂件里能用的主题色：取宿主页面的 shadcn 变量 */
export function themeVars() {
  const css = getComputedStyle(document.documentElement)
  const pick = (name: string) => css.getPropertyValue(name).trim()
  return {
    '--fg': pick('--foreground'),
    '--muted': pick('--muted-foreground'),
    '--bg': pick('--background'),
    '--accent': pick('--muted'),
    '--primary': pick('--primary'),
    '--primary-fg': pick('--primary-foreground'),
    '--border': pick('--border'),
  }
}

export function currentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

const BASE_CSS = `
html, body { margin: 0; background: transparent; overflow: hidden; }
body { color: var(--fg); font: 12px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; user-select: none; }
#root { width: 100vw; height: 100vh; }
* { box-sizing: border-box; }
.center { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }
.row { display: flex; align-items: center; gap: 6px; }
.big { font: 600 28px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.muted { color: var(--muted); }
.btn { border: 1px solid var(--border); background: var(--accent); color: var(--fg); border-radius: 8px; padding: 3px 10px; font: inherit; cursor: pointer; }
.btn:hover { filter: brightness(0.96); }
.btn.primary { background: var(--primary); color: var(--primary-fg); border-color: transparent; }
`

/**
 * Worker 里的 api（用户脚本能用的全部能力），用户代码包在 __start 里，拿到初始化数据后才执行。
 * 这段必须保持「没有换行之外的行号变化」：报错行号按 PRELUDE 的行数换算
 */
const PRELUDE = `'use strict';
const __post = (m) => postMessage(m);
const __errLine = (e) => { const m = /blob:[^)\\s]*:(\\d+):\\d+/.exec((e && e.stack) || ''); return m ? Number(m[1]) : undefined };
const __report = (e) => __post({ type: 'error', message: String((e && e.message) || e), line: __errLine(e) });
const __safe = (fn) => (...args) => { try { return fn(...args) } catch (e) { __report(e) } };
let __data = {}; const __handlers = {}; const __themeFns = [];
const api = {
  settings: {}, theme: 'light',
  render(html) { __post({ type: 'render', html: String(html) }) },
  on(name, fn) { (__handlers[name] = __handlers[name] || []).push(__safe(fn)) },
  every(ms, fn) { const id = setInterval(__safe(fn), Math.max(200, Number(ms) || 0)); return () => clearInterval(id) },
  storage: {
    get: (key) => __data[key],
    set(key, value) { __data = Object.assign({}, __data, { [key]: value }); __post({ type: 'data', data: __data }) },
  },
  size(width, height) { __post({ type: 'size', width: Number(width), height: Number(height) }) },
  fit() { __post({ type: 'fit' }) },
  copy(text) { __post({ type: 'copy', text: String(text) }) },
  open(url) { __post({ type: 'open', url: String(url) }) },
  notify(text) { __post({ type: 'notify', text: String(text) }) },
  onTheme(fn) { __themeFns.push(__safe(fn)) },
  line: {
    keepOpen(on) { __post({ type: 'line', op: 'keepOpen', value: on !== false }) },
    collapse() { __post({ type: 'line', op: 'collapse' }) },
    reveal() { __post({ type: 'line', op: 'reveal' }) },
    focus(on) { __post({ type: 'line', op: 'focus', value: on !== false }) },
  },
  handle: {
    set(value) {
      if (value == null) return __post({ type: 'handle', value: null });
      const v = {};
      if (value.text != null) v.text = String(value.text);
      if (typeof value.progress === 'number' && isFinite(value.progress)) v.progress = value.progress;
      __post({ type: 'handle', value: v });
    },
    clear() { __post({ type: 'handle', value: null }) },
  },
};
self.addEventListener('unhandledrejection', (e) => __report(e.reason));
self.onmessage = (e) => {
  const m = e.data || {};
  if (m.type === 'ping') return __post({ type: 'pong' });
  if (m.type === 'init') { api.settings = m.settings; api.theme = m.theme; __data = m.data || {}; try { __start() } catch (err) { __report(err) } return }
  if (m.type === 'event') { (__handlers[m.name] || []).forEach((fn) => fn(m.detail)); return }
  if (m.type === 'theme') { api.theme = m.theme; __themeFns.forEach((fn) => fn(m.theme)) }
};
function __start() {
`

/** 用户代码在 Worker 脚本里从第几行开始 */
const CODE_LINE = PRELUDE.split('\n').length

/** iframe 里的宿主代码：建 Worker、转发消息、渲染 HTML、转发事件、看门狗 */
const SHIM = `
(() => {
  const init = JSON.parse(document.getElementById('widget-init').textContent)
  const root = document.getElementById('root')
  const post = (m) => parent.postMessage(Object.assign({ __widget: true }, m), '*')
  const setVars = (vars) => { for (const k in vars) document.documentElement.style.setProperty(k, vars[k]) }
  setVars(init.vars)
  const userLine = (line) => (typeof line === 'number' && line >= init.codeLine ? line - init.codeLine + 1 : undefined)

  let worker
  try {
    worker = new Worker(URL.createObjectURL(new Blob([init.source], { type: 'text/javascript' })))
  } catch (e) {
    post({ type: 'error', message: '无法启动挂件：' + e.message, fatal: true })
    return
  }
  let lastPong = Date.now()
  let pending = null
  const stop = (message) => {
    worker.terminate()
    clearInterval(watchdog)
    root.innerHTML = '<div class="center muted">挂件已停止</div>'
    post({ type: 'error', message, fatal: true })
  }
  worker.onerror = (e) => {
    e.preventDefault()
    post({ type: 'error', message: e.message || '脚本出错', line: userLine(e.lineno) })
  }
  worker.onmessage = (e) => {
    const m = e.data || {}
    switch (m.type) {
      case 'pong': lastPong = Date.now(); return
      case 'render':
        // 合并到下一帧再写，挂件刷得再快也只重绘一次
        pending = String(m.html).slice(0, ${HTML_MAX})
        requestAnimationFrame(() => { if (pending !== null) { root.innerHTML = pending; pending = null } })
        return
      case 'fit': {
        const el = root.firstElementChild || root
        const r = el.getBoundingClientRect()
        post({ type: 'size', width: Math.ceil(r.width), height: Math.ceil(r.height) })
        return
      }
      case 'error': post({ type: 'error', message: String(m.message), line: userLine(m.line) }); return
      default: post(m)
    }
  }
  const forward = (name) => root.addEventListener(name, (e) => {
    const el = e.target.closest('[data-act]')
    const detail = { act: el ? el.dataset.act : undefined, data: el ? Object.assign({}, el.dataset) : {} }
    if ('value' in e.target) detail.value = e.target.value
    worker.postMessage({ type: 'event', name, detail })
  })
  ;['click', 'input', 'change'].forEach(forward)
  window.addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || e.data.type !== 'theme') return
    setVars(e.data.vars)
    worker.postMessage({ type: 'theme', theme: e.data.theme })
  })
  const watchdog = setInterval(() => {
    if (Date.now() - lastPong > ${HANG_MS}) stop('挂件脚本没有响应（可能有死循环），已被停止')
    else worker.postMessage({ type: 'ping' })
  }, 1000)
  worker.postMessage({ type: 'init', settings: init.settings, data: init.data, theme: init.theme })
})()
`

function parseSettings(json: string): unknown {
  if (!json.trim()) return {}
  return JSON.parse(json)
}

/** 生成挂件 iframe 的 srcdoc；settings 不是合法 JSON 时抛错 */
export function buildWidgetDoc(ext: Pick<WidgetExtension, 'code' | 'settings'>, data: Record<string, unknown> = {}) {
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const init = {
    settings: parseSettings(ext.settings),
    data,
    theme: currentTheme(),
    vars: themeVars(),
    // 用户代码包在 __start 函数里；末尾补换行，避免最后一行是注释时吞掉右括号
    source: `${PRELUDE}${ext.code}\n}\n`,
    codeLine: CODE_LINE,
  }
  const initJson = JSON.stringify(init).replace(/</g, '\\u003c')
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    'worker-src blob:',
    "style-src 'unsafe-inline'",
    'img-src data: blob: https: http:',
    'font-src data:',
    // Worker 里的 fetch：只能请求允许跨域的网络接口
    'connect-src https: http:',
  ].join('; ')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><style>${BASE_CSS}</style></head><body><div id="root"></div><script type="application/json" id="widget-init">${initJson}</script><script nonce="${nonce}">${SHIM}</script></body></html>`
}
