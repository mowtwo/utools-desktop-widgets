// 挂件扩展的沙箱运行时
// 每个挂件跑在 sandbox="allow-scripts" 的 iframe 里（不透明源）：碰不到悬浮层的 preload 和本地能力，
// 只能通过注入的 api 发 postMessage，由宿主（悬浮层或编辑器预览）决定是否执行

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

/** 沙箱发给宿主的消息 */
export type WidgetMessage =
  | { type: 'size'; width: number; height: number }
  | { type: 'data'; data: Record<string, unknown> }
  | { type: 'copy'; text: string }
  | { type: 'open'; url: string }
  | { type: 'notify'; text: string }
  | { type: 'error'; message: string; line?: number }

export const WIDGET_MIN = { width: 40, height: 24 }
export const WIDGET_MAX = { width: 320, height: 260 }

export const clampSize = (w: number, h: number) => ({
  width: Math.round(Math.min(WIDGET_MAX.width, Math.max(WIDGET_MIN.width, w || 0))),
  height: Math.round(Math.min(WIDGET_MAX.height, Math.max(WIDGET_MIN.height, h || 0))),
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
#root { width: 100vw; height: 100vh; box-sizing: border-box; }
* { box-sizing: border-box; }
.center { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; }
.row { display: flex; align-items: center; gap: 6px; }
.big { font: 600 28px/1.1 ui-monospace, SFMono-Regular, Menlo, monospace; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
.muted { color: var(--muted); }
.btn { border: 1px solid var(--border); background: var(--accent); color: var(--fg); border-radius: 8px; padding: 3px 10px; font: inherit; cursor: pointer; }
.btn:hover { filter: brightness(0.96); }
.btn.primary { background: var(--primary); color: var(--primary-fg); border-color: transparent; }
`

/** 注入到沙箱里的 api，见编辑器里的「API 说明」 */
const API_SCRIPT = `
(() => {
  const post = (m) => parent.postMessage(Object.assign({ __widget: true }, m), '*')
  const report = (e) => post({ type: 'error', message: String((e && e.message) || e) })
  const init = JSON.parse(document.getElementById('widget-init').textContent)
  // 页面行号换算成用户脚本里的行号
  window.onerror = (message, _src, line) => {
    const userLine = line - init.codeLine + 1
    post({ type: 'error', message: String(message), line: userLine > 0 ? userLine : undefined })
    return true
  }
  window.addEventListener('unhandledrejection', (e) => report(e.reason))
  let data = init.data || {}
  const themeListeners = []
  const root = document.getElementById('root')
  const setVars = (vars) => { for (const k in vars) document.documentElement.style.setProperty(k, vars[k]) }
  setVars(init.vars)
  const api = {
    root,
    settings: init.settings,
    theme: init.theme,
    render(html) { root.innerHTML = html },
    every(ms, fn) {
      const id = setInterval(() => { try { fn() } catch (e) { report(e) } }, Math.max(200, Number(ms) || 0))
      return () => clearInterval(id)
    },
    storage: {
      get: (key) => data[key],
      set(key, value) { data = Object.assign({}, data, { [key]: value }); post({ type: 'data', data }) },
    },
    size(width, height) { post({ type: 'size', width: Number(width), height: Number(height) }) },
    fit() {
      const r = root.firstElementChild ? root.firstElementChild.getBoundingClientRect() : root.getBoundingClientRect()
      post({ type: 'size', width: Math.ceil(r.width), height: Math.ceil(r.height) })
    },
    copy(text) { post({ type: 'copy', text: String(text) }) },
    open(url) { post({ type: 'open', url: String(url) }) },
    notify(text) { post({ type: 'notify', text: String(text) }) },
    onTheme(fn) { themeListeners.push(fn) },
  }
  window.addEventListener('message', (e) => {
    if (e.source !== parent || !e.data || e.data.type !== 'theme') return
    api.theme = e.data.theme
    setVars(e.data.vars)
    themeListeners.forEach((fn) => { try { fn(api.theme) } catch (err) { report(err) } })
  })
  window.api = api
})()
`

function parseSettings(json: string): unknown {
  if (!json.trim()) return {}
  return JSON.parse(json)
}

/** 生成挂件 iframe 的 srcdoc；settings 不是合法 JSON 时抛错 */
export function buildWidgetDoc(ext: Pick<WidgetExtension, 'code' | 'settings'>, data: Record<string, unknown> = {}) {
  // 用户代码单独一个 script：语法错误也能被 onerror 捕获
  const code = ext.code.replace(/<\/script/gi, '<\\/script')
  const head = (initJson: string) =>
    `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body><div id="root"></div><script type="application/json" id="widget-init">${initJson}</script><script>${API_SCRIPT}</script><script>\n`
  const init = { settings: parseSettings(ext.settings), data, theme: currentTheme(), vars: themeVars(), codeLine: 0 }
  // 用户代码从第几行开始（JSON 里没有换行，填入行号不会改变行数）
  init.codeLine = head('').split('\n').length
  const initJson = JSON.stringify(init).replace(/</g, '\\u003c')
  return `${head(initJson)}${code}\n</script></body></html>`
}
