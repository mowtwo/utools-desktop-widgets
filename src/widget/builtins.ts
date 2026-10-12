import type { WidgetExtension } from './runtime'

// 内置扩展：首次启动时写入数据库，之后和用户自己的扩展一样可以改、可以删

const clock = `// 时钟：每秒刷新一次
const pad = (n) => String(n).padStart(2, '0')

function draw() {
  const now = new Date()
  let time = pad(now.getHours()) + ':' + pad(now.getMinutes())
  if (api.settings.showSeconds) time += ':' + pad(now.getSeconds())
  const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
  api.render(\`
    <div class="center">
      <div class="big">\${time}</div>
      <div class="muted">\${date}</div>
    </div>\`)
}

draw()
api.every(1000, draw)
`

const pomodoro = `// 番茄钟：开始后进入专注——隐藏其他挂件、收起晾衣绳、把手上显示倒计时；
// 结束时弹出晾衣绳并发通知。演示 api.on、api.storage、api.line、api.handle
const total = (api.settings.minutes || 25) * 60
const focusMode = api.settings.focusMode !== false
let endAt = api.storage.get('endAt') || 0
let left = api.storage.get('left') ?? total

const remaining = () => (endAt ? Math.max(0, Math.round((endAt - Date.now()) / 1000)) : left)
const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')

function save() {
  api.storage.set('endAt', endAt)
  api.storage.set('left', left)
}

function enterFocus() {
  if (!focusMode) return
  api.line.focus(true)
  api.line.collapse()
}

function leaveFocus() {
  api.line.focus(false)
  api.handle.clear()
}

function draw() {
  const s = remaining()
  if (endAt && s === 0) {
    endAt = 0
    left = total
    save()
    leaveFocus()
    api.line.reveal()
    api.notify('番茄钟结束，休息一下')
  }
  if (endAt && focusMode) api.handle.set({ text: '🍅 ' + fmt(s), progress: 1 - s / total })
  api.render(\`
    <div class="center" style="gap:6px">
      <div class="big">\${fmt(remaining())}</div>
      <div class="row">
        <button class="btn primary" data-act="toggle">\${endAt ? '暂停' : '开始'}</button>
        <button class="btn" data-act="reset">重置</button>
      </div>
    </div>\`)
}

// 点击事件：按钮上的 data-act 会作为 act 传进来
api.on('click', ({ act }) => {
  if (act === 'toggle') {
    if (endAt) {
      left = remaining()
      endAt = 0
      leaveFocus()
    } else {
      endAt = Date.now() + left * 1000
      enterFocus()
    }
  } else if (act === 'reset') {
    endAt = 0
    left = total
    leaveFocus()
  } else return
  save()
  draw()
})

// 重启后接着专注
if (endAt) enterFocus()
draw()
api.every(1000, draw)
`

export const BUILTIN_EXTENSIONS: WidgetExtension[] = [
  { id: 'clock', name: '时钟', code: clock, width: 136, height: 64, settings: '{\n  "showSeconds": false\n}', builtin: true },
  { id: 'pomodoro', name: '番茄钟', code: pomodoro, width: 136, height: 78, settings: '{\n  "minutes": 25,\n  "focusMode": true\n}', builtin: true },
]

/** 新建扩展时的模板 */
export const TEMPLATE: Omit<WidgetExtension, 'id'> = {
  name: '新挂件',
  width: 136,
  height: 64,
  settings: '{\n  "text": "你好"\n}',
  code: `// 挂件脚本在独立线程的沙箱里运行，通过 api 和外界交互，右边「API 说明」里有完整列表
api.render(\`
  <div class="center">
    <div class="big">\${api.settings.text}</div>
    <div class="muted">点我复制</div>
  </div>\`)

api.on('click', () => {
  api.copy(api.settings.text)
  api.notify('已复制')
})
`,
}

/** 编辑器里的 API 说明，同时用于自动补全 */
export const API_DOCS: { name: string; signature: string; doc: string }[] = [
  { name: 'render', signature: 'api.render(html)', doc: '用一段 HTML 替换挂件内容（HTML 里的脚本和 onclick 不会执行）' },
  { name: 'on', signature: "api.on('click' | 'input' | 'change', fn)", doc: 'fn({ act, data, value })：act 是被点元素上的 data-act，data 是它的全部 data-* 属性' },
  { name: 'every', signature: 'api.every(ms, fn)', doc: '每隔 ms 毫秒执行一次 fn（最短 200ms），返回取消函数' },
  { name: 'settings', signature: 'api.settings', doc: '编辑器「设置」里写的 JSON' },
  { name: 'storage', signature: 'api.storage.get(key) / set(key, value)', doc: '每个挂件自己的持久化数据，重启后还在（上限 32KB）' },
  { name: 'size', signature: 'api.size(width, height)', doc: '调整挂件尺寸（px）' },
  { name: 'fit', signature: 'api.fit()', doc: '按内容的第一个元素大小调整挂件尺寸' },
  { name: 'copy', signature: 'api.copy(text)', doc: '复制文本到剪贴板' },
  { name: 'open', signature: 'api.open(url)', doc: '用浏览器打开 http / https 链接' },
  { name: 'notify', signature: 'api.notify(text)', doc: '发一条系统通知（5 秒最多一次）' },
  { name: 'theme', signature: 'api.theme / api.onTheme(fn)', doc: "当前主题 'light' | 'dark'，以及主题变化时的回调" },
  { name: 'line', signature: 'api.line.focus(on)', doc: '专注：隐藏绳上其他东西，只留这个挂件' },
  { name: 'line', signature: 'api.line.keepOpen(on)', doc: '不让晾衣绳自动收起' },
  { name: 'line', signature: 'api.line.collapse()', doc: '立刻收起晾衣绳（常驻模式下无效）' },
  { name: 'line', signature: 'api.line.reveal()', doc: '弹出晾衣绳一会儿（10 秒最多一次）' },
  { name: 'handle', signature: 'api.handle.set({ text, progress }) / clear()', doc: '晾衣绳收起时，顶部小把手上显示的文字（最多 12 字）和进度（0~1）；同一时间只有一个挂件能占用' },
]

/** 自动补全用：api. 后面的成员 */
export const API_MEMBERS = [...new Set(API_DOCS.map((d) => d.name))].map((name) => ({
  name,
  signature: API_DOCS.filter((d) => d.name === name).map((d) => d.signature).join(' / '),
  doc: API_DOCS.filter((d) => d.name === name).map((d) => d.doc).join('；'),
}))

export const CSS_HELPERS = '挂件在独立线程的沙箱里运行，不能访问 DOM、本地文件和插件数据；死循环会被自动停止。内置样式类：.center 居中竖排、.row 横排、.big 大号等宽数字、.muted 次要文字、.btn / .btn.primary 按钮；颜色变量 --fg --muted --bg --accent --primary --border'
