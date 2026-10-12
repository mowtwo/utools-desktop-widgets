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

const pomodoro = `// 番茄钟：点按钮开始 / 暂停，结束时发系统通知
// 演示 api.storage（重启后接着计时）和事件处理
const total = (api.settings.minutes || 25) * 60
let endAt = api.storage.get('endAt') || 0
let left = api.storage.get('left') ?? total

function remaining() {
  return endAt ? Math.max(0, Math.round((endAt - Date.now()) / 1000)) : left
}

function draw() {
  const s = remaining()
  if (endAt && s === 0) {
    endAt = 0
    left = total
    api.storage.set('endAt', 0)
    api.storage.set('left', total)
    api.notify('番茄钟结束，休息一下')
  }
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  api.render(\`
    <div class="center" style="gap:6px">
      <div class="big">\${mm}:\${ss}</div>
      <div class="row">
        <button class="btn primary" data-act="toggle">\${endAt ? '暂停' : '开始'}</button>
        <button class="btn" data-act="reset">重置</button>
      </div>
    </div>\`)
}

api.root.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]')?.dataset.act
  if (act === 'toggle') {
    if (endAt) { left = remaining(); endAt = 0 }
    else endAt = Date.now() + left * 1000
  } else if (act === 'reset') {
    endAt = 0
    left = total
  } else return
  api.storage.set('endAt', endAt)
  api.storage.set('left', left)
  draw()
})

draw()
api.every(1000, draw)
`

export const BUILTIN_EXTENSIONS: WidgetExtension[] = [
  { id: 'clock', name: '时钟', code: clock, width: 136, height: 64, settings: '{\n  "showSeconds": false\n}', builtin: true },
  { id: 'pomodoro', name: '番茄钟', code: pomodoro, width: 136, height: 78, settings: '{\n  "minutes": 25\n}', builtin: true },
]

/** 新建扩展时的模板 */
export const TEMPLATE: Omit<WidgetExtension, 'id'> = {
  name: '新挂件',
  width: 136,
  height: 64,
  settings: '{\n  "text": "你好"\n}',
  code: `// 挂件脚本在沙箱里运行，通过 api 和外界交互，右边「API」里有完整说明
api.render(\`
  <div class="center">
    <div class="big">\${api.settings.text}</div>
    <div class="muted">点我复制</div>
  </div>\`)

api.root.addEventListener('click', () => {
  api.copy(api.settings.text)
  api.notify('已复制')
})
`,
}

/** 编辑器里的 API 说明，同时用于自动补全 */
export const API_DOCS: { name: string; signature: string; doc: string }[] = [
  { name: 'render', signature: 'api.render(html)', doc: '用一段 HTML 替换挂件内容' },
  { name: 'root', signature: 'api.root', doc: '挂件的根元素，可以在上面监听点击等事件（render 不会替换它）' },
  { name: 'every', signature: 'api.every(ms, fn)', doc: '每隔 ms 毫秒执行一次 fn（最短 200ms），返回取消函数' },
  { name: 'settings', signature: 'api.settings', doc: '编辑器「设置」里写的 JSON' },
  { name: 'storage', signature: 'api.storage.get(key) / set(key, value)', doc: '每个挂件自己的持久化数据，重启后还在' },
  { name: 'size', signature: 'api.size(width, height)', doc: '调整挂件尺寸（px）' },
  { name: 'fit', signature: 'api.fit()', doc: '按内容的第一个元素大小调整挂件尺寸' },
  { name: 'copy', signature: 'api.copy(text)', doc: '复制文本到剪贴板' },
  { name: 'open', signature: 'api.open(url)', doc: '用浏览器打开 http / https 链接' },
  { name: 'notify', signature: 'api.notify(text)', doc: '发一条系统通知' },
  { name: 'theme', signature: "api.theme / api.onTheme(fn)", doc: "当前主题 'light' | 'dark'，以及主题变化时的回调" },
]

export const CSS_HELPERS = '内置样式类：.center 居中竖排、.row 横排、.big 大号等宽数字、.muted 次要文字、.btn / .btn.primary 按钮；颜色变量 --fg --muted --bg --accent --primary --border'
