// 挂件运行器：一个页面只有一个隐藏的沙箱 iframe，里面每个挂件实例一个 Worker
//
// - iframe：sandbox="allow-scripts"（不透明源）+ CSP，只跑这里的宿主脚本，碰不到悬浮层的 preload 和本地文件
// - Worker：用户脚本在独立线程里运行；看门狗每秒探测一次，3 秒没回应就 terminate
// - 挂件交出的只是元素树数据，渲染由宿主页面自己的组件完成（见 protocol.ts / WidgetView.tsx）

import { TREE_MAX_DEPTH, TREE_MAX_NODES } from './protocol'

const HANG_MS = 3000

/**
 * Worker 里的运行环境：defineWidget 入口、ui 元素工厂、ctx 能力。
 * 用户代码拼在后面，报错行号按这段的行数换算
 */
const PRELUDE = `'use strict';
const __post = (m) => postMessage(m);
const __errLine = (e) => { const m = /blob:[^)\\s]*:(\\d+):\\d+/.exec((e && e.stack) || ''); return m ? Number(m[1]) : undefined };
const __report = (e) => __post({ type: 'error', message: String((e && e.message) || e), line: __errLine(e) });
const __safe = (fn) => (...args) => { try { return fn(...args) } catch (e) { __report(e) } };
let __setup = null;
let __render = null;
let __scheduled = false;
let __handlers = new Map();
let __prevHandlers = new Map();
let __hid = 0;
let __data = {};
const __themeFns = [];
function defineWidget(setup) {
  if (typeof setup !== 'function') throw new Error('defineWidget 需要传入一个入口函数');
  __setup = setup;
}
const __el = (type, props, children) => {
  if (Array.isArray(props)) { children = props; props = {} }
  return { __ui: true, type, props: props || {}, children };
};
const ui = {
  box: (props, children) => __el('box', props, children),
  row: (props, children) => { const n = __el('box', props, children); n.props = Object.assign({ direction: 'row', align: 'center' }, n.props); return n },
  column: (props, children) => { const n = __el('box', props, children); n.props = Object.assign({ direction: 'column' }, n.props); return n },
  text: (content, props) => __el('text', props, String(content ?? '')),
  image: (src, props) => __el('image', Object.assign({}, props, { src: String(src) })),
  button: (label, props) => __el('button', props, String(label ?? '')),
  progress: (value, props) => __el('progress', Object.assign({}, props, { value: Number(value) })),
  spacer: (size) => __el('spacer', size == null ? {} : { size }),
};
function __serialize(node, depth, counter) {
  if (node == null || node === false || node === true || node === '') return null;
  if (typeof node === 'string' || typeof node === 'number') return { type: 'text', props: {}, children: String(node) };
  if (typeof node !== 'object' || !node.__ui) throw new Error('渲染函数只能返回 ui.* 创建的元素');
  if (depth > ${TREE_MAX_DEPTH}) throw new Error('元素嵌套太深（最多 ${TREE_MAX_DEPTH} 层）');
  if (++counter.n > ${TREE_MAX_NODES}) throw new Error('元素太多（最多 ${TREE_MAX_NODES} 个）');
  const props = {};
  for (const k in node.props) {
    const v = node.props[k];
    if (typeof v === 'function') { const id = 'h' + (++__hid); __handlers.set(id, v); props[k] = id }
    else props[k] = v;
  }
  let children = node.children;
  if (Array.isArray(children)) children = children.flat(4).map((c) => __serialize(c, depth + 1, counter)).filter(Boolean);
  return { type: node.type, props, children };
}
function __flush() {
  __scheduled = false;
  if (!__render) return;
  try {
    __prevHandlers = __handlers;
    __handlers = new Map();
    const tree = __serialize(__render(ctx.state), 0, { n: 0 });
    __post({ type: 'tree', tree });
  } catch (e) { __report(e) }
}
const ctx = {
  settings: {},
  theme: 'light',
  state: {},
  setState(patch) {
    const next = typeof patch === 'function' ? patch(ctx.state) : patch;
    Object.assign(ctx.state, next || {});
    ctx.update();
  },
  update() { if (!__scheduled) { __scheduled = true; setTimeout(__flush, 0) } },
  every(ms, fn) { const id = setInterval(__safe(fn), Math.max(200, Number(ms) || 0)); return () => clearInterval(id) },
  storage: {
    get: (key) => __data[key],
    set(key, value) { __data = Object.assign({}, __data, { [key]: value }); __post({ type: 'data', data: __data }) },
  },
  size(width, height) { __post({ type: 'size', width: Number(width), height: Number(height) }) },
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
  if (m.type === 'event') {
    const fn = __handlers.get(m.handler) || __prevHandlers.get(m.handler);
    if (fn) __safe(fn)(m.payload);
    return;
  }
  if (m.type === 'theme') { ctx.theme = m.theme; __themeFns.forEach((fn) => fn(m.theme)); ctx.update(); return }
  if (m.type === 'init') {
    ctx.settings = m.settings || {};
    ctx.theme = m.theme;
    __data = m.data || {};
    if (!__setup) return __report(new Error('脚本里没有调用 defineWidget(入口函数)'));
    try {
      const render = __setup(ctx);
      if (typeof render !== 'function') return __report(new Error('入口函数需要返回一个渲染函数'));
      __render = render;
      __flush();
    } catch (err) { __report(err) }
  }
};
`

/** 用户代码在 Worker 脚本里从第几行开始 */
const CODE_LINE = PRELUDE.split('\n').length

/** 隐藏 iframe 里的宿主脚本：管理所有 Worker、看门狗、转发消息 */
const SHIM = `
(() => {
  const workers = new Map()
  const post = (id, msg) => parent.postMessage({ __widgetRunner: true, id, msg }, '*')
  const userLine = (line) => (typeof line === 'number' && line >= ${CODE_LINE} ? line - ${CODE_LINE} + 1 : undefined)
  const stop = (id, reason) => {
    const w = workers.get(id)
    if (!w) return
    w.worker.terminate()
    workers.delete(id)
    if (reason) post(id, { type: 'error', message: reason, fatal: true })
  }
  const start = (id, source, init) => {
    stop(id)
    let worker
    try {
      worker = new Worker(URL.createObjectURL(new Blob([source], { type: 'text/javascript' })))
    } catch (e) {
      post(id, { type: 'error', message: '无法启动挂件：' + e.message, fatal: true })
      return
    }
    // pingAt：发出、还没收到回应的那次探测的时间；misses：连续超时次数
    const entry = { worker, pingAt: 0, misses: 0 }
    workers.set(id, entry)
    worker.onerror = (e) => {
      e.preventDefault()
      post(id, { type: 'error', message: e.message || '脚本出错', line: userLine(e.lineno) })
    }
    worker.onmessage = (e) => {
      const m = e.data || {}
      if (m.type === 'pong') { entry.pingAt = 0; entry.misses = 0; return }
      if (m.type === 'error') m.line = userLine(m.line)
      post(id, m)
    }
    worker.postMessage({ type: 'init', settings: init.settings, data: init.data, theme: init.theme })
  }
  // 看门狗：只认「发出探测后 HANG_MS 内没回应」，连续两次才停。
  // 看门狗自己被推迟（后台降速、电脑睡眠）时这一轮作废，免得把正常的挂件误判成死循环
  let lastTick = Date.now()
  setInterval(() => {
    const now = Date.now()
    const late = now - lastTick > 2000
    lastTick = now
    for (const [id, w] of workers) {
      if (late) { w.pingAt = 0; w.misses = 0 }
      if (w.pingAt && now - w.pingAt > ${HANG_MS}) {
        w.misses++
        w.pingAt = 0
        if (w.misses >= 2) { stop(id, '挂件脚本没有响应（可能有死循环），已被停止'); continue }
      }
      if (!w.pingAt) { w.pingAt = now; w.worker.postMessage({ type: 'ping' }) }
    }
  }, 1000)
  window.addEventListener('message', (e) => {
    if (e.source !== parent || !e.data) return
    const m = e.data
    if (m.type === 'start') start(m.id, m.source, m.init)
    else if (m.type === 'stop') stop(m.id)
    else if (m.type === 'event') { const w = workers.get(m.id); if (w) w.worker.postMessage({ type: 'event', handler: m.handler, payload: m.payload }) }
    else if (m.type === 'theme') { for (const w of workers.values()) w.worker.postMessage({ type: 'theme', theme: m.theme }) }
  })
  parent.postMessage({ __widgetRunner: true, ready: true }, '*')
})()
`

function runnerDoc() {
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const csp = [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    'worker-src blob:',
    // Worker 里的 fetch：只能请求允许跨域的网络接口
    'connect-src https: http:',
  ].join('; ')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"></head><body><script nonce="${nonce}">${SHIM}</script></body></html>`
}

export type RunnerMessage = Record<string, unknown> & { type: string }

export interface StartOptions {
  code: string
  settings: unknown
  data: Record<string, unknown>
  theme: 'light' | 'dark'
}

class WidgetRunner {
  private iframe: HTMLIFrameElement
  private ready = false
  private queue: unknown[] = []
  private listeners = new Map<string, (msg: RunnerMessage) => void>()

  constructor() {
    this.iframe = document.createElement('iframe')
    this.iframe.sandbox.add('allow-scripts')
    this.iframe.title = '挂件运行器'
    this.iframe.setAttribute('aria-hidden', 'true')
    // 不用 display:none，免得被当成隐藏的框架降低定时器优先级
    Object.assign(this.iframe.style, { position: 'fixed', left: '-10px', top: '-10px', width: '1px', height: '1px', opacity: '0', border: '0', pointerEvents: 'none' })
    this.iframe.srcdoc = runnerDoc()
    window.addEventListener('message', (e) => {
      if (e.source !== this.iframe.contentWindow || !e.data?.__widgetRunner) return
      if (e.data.ready) {
        this.ready = true
        for (const m of this.queue) this.send(m)
        this.queue = []
        return
      }
      const listener = this.listeners.get(e.data.id)
      // 宿主处理出错也不能影响别的挂件
      try {
        listener?.(e.data.msg)
      } catch (err) {
        console.error('[widget]', err)
      }
    })
    document.body.appendChild(this.iframe)
  }

  private send(m: unknown) {
    if (!this.ready) this.queue.push(m)
    else this.iframe.contentWindow?.postMessage(m, '*')
  }

  start(id: string, opts: StartOptions, listener: (msg: RunnerMessage) => void) {
    this.listeners.set(id, listener)
    this.send({
      type: 'start',
      id,
      // 用户代码末尾补换行，避免最后一行是注释时影响后面
      source: `${PRELUDE}${opts.code}\n`,
      init: { settings: opts.settings, data: opts.data, theme: opts.theme },
    })
  }

  stop(id: string) {
    this.listeners.delete(id)
    this.send({ type: 'stop', id })
  }

  dispatch(id: string, handler: string, payload?: unknown) {
    this.send({ type: 'event', id, handler, payload })
  }

  setTheme(theme: 'light' | 'dark') {
    this.send({ type: 'theme', theme })
  }
}

let runner: WidgetRunner | null = null

/** 页面里唯一的挂件运行器，第一次用到时才创建 */
export function getRunner() {
  runner ??= new WidgetRunner()
  return runner
}
