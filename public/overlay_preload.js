// 悬浮层自定义窗口 preload
// - 与插件应用主界面之间的消息桥接（改动状态的操作都交给主界面执行）
// - 轮询光标位置：鼠标顶到屏幕上边缘时滑出晾衣绳（macOS 菜单栏盖在悬浮层上面，收不到 mousemove）
// - 复制、打开、拖出等只读操作直接在这里执行
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { ipcRenderer, webUtils } = require('electron')

const CURSOR_POLL_MS = 60
/** 这个悬浮层所在的屏幕：每块屏幕一个悬浮层，发给主界面的消息都带上它 */
const DISPLAY = Number(new URLSearchParams(location.search).get('display'))
const send = (channel, ...args) => utools.sendToParent(channel, DISPLAY, ...args)
const logFile = path.join(require('./capabilities.js').dataDir(), 'debug.log')

/** 悬浮层自己写日志：主界面被结束时也能留下记录 */
function log(event, detail) {
  try {
    const line = `${new Date().toISOString()} overlay ${event}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}\n`
    fs.appendFileSync(logFile, line)
  } catch {}
}

window.addEventListener('error', (e) => log('error', { message: e.message, line: e.lineno }))
window.addEventListener('unhandledrejection', (e) => log('rejection', { reason: String(e.reason) }))
document.addEventListener('visibilitychange', () => log('visibility', document.visibilityState))
log('start', { visibility: document.visibilityState })
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'svg']

/** 信号截图的请求编号 -> 回调 */
const captureWaiters = new Map()
let captureSeq = 0
ipcRenderer.on('overlay:ping-captured', (_e, reqId, result) => {
  captureWaiters.get(reqId)?.(result)
  captureWaiters.delete(reqId)
})

window.overlay = {
  log,
  /** 信号快捷键：point 是光标的屏幕坐标 */
  onPingOpen(listener) {
    ipcRenderer.on('overlay:ping-open', (_e, point) => listener(point))
  },
  /** AI Agent 直接发信号（MCP）：不弹轮盘、不截图；point 是屏幕坐标，signal 是开源风格的信号 id */
  onPingFire(listener) {
    ipcRenderer.on('overlay:ping-fire', (_e, payload) => listener(payload))
  },
  /** 截取屏幕上的一块（屏幕全局 DIP 坐标），返回 Data URL 和截图的像素比例 */
  pingCapture(rect) {
    const reqId = ++captureSeq
    return new Promise((resolve) => {
      captureWaiters.set(reqId, resolve)
      send('overlay:ping-capture', reqId, rect)
      setTimeout(() => {
        if (captureWaiters.delete(reqId)) resolve({ error: '截图超时' })
      }, 5000)
    })
  },
  pingResult(dataUrl) {
    send('overlay:ping-result', dataUrl)
  },
  onState(listener) {
    ipcRenderer.on('overlay:state', (_e, payload) => listener(payload))
  },
  /** duration：滑出后至少停留多久（ms） */
  onPeek(listener) {
    ipcRenderer.on('overlay:peek', (_e, duration) => listener(duration))
  },
  ready() {
    send('overlay:ready')
  },
  /** 鼠标在挂件上时关闭点击穿透，离开时恢复 */
  setInteractive(interactive) {
    send('overlay:interactive', interactive)
  },
  /** 请主界面让悬浮层整页重绘 */
  repaint() {
    send('overlay:repaint')
  },
  remove(id) {
    send('overlay:remove', id)
  },
  /** x：在绳子上的位置，占绳长的比例 */
  move(id, x) {
    send('overlay:move', id, x)
  },
  addClip(x) {
    send('overlay:add-clip', x)
  },
  /** source：files 选文件 / paste 剪贴板 / capture 截图 */
  fillClip(clipId, source) {
    send('overlay:fill-clip', clipId, source)
  },
  /** 从系统拖进来的文件 */
  drop(files, x, clipId) {
    const paths = Array.from(files)
      .map((f) => webUtils.getPathForFile(f))
      .filter(Boolean)
    if (paths.length) send('overlay:drop', paths, x, clipId)
  },
  /**
   * 轮询光标的屏幕坐标（DIP）。listener 返回下一次轮询的间隔（ms），不返回就用默认值；
   * 每次查询都要问一次 uTools 主进程，离屏幕顶部远时放慢可以省下大部分开销
   */
  watchCursor(listener) {
    let timer = 0
    let stopped = false
    const loop = () => {
      if (stopped) return
      // 拿不到光标位置（插件正在重启）或处理出错时跳过这一次，轮询本身不能停
      let next
      try {
        const point = utools.getCursorScreenPoint()
        if (point) next = listener(point)
      } catch (err) {
        log('cursor-error', String(err && err.message))
      }
      timer = setTimeout(loop, typeof next === 'number' ? next : CURSOR_POLL_MS)
    }
    timer = setTimeout(loop, CURSOR_POLL_MS)
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  },
  /**
   * 文件夹衣架展开时列出的内容：跳过隐藏文件，最近修改的在前，最多 limit 项
   * 只读，不改动任何文件
   */
  listFolder(dir, limit) {
    try {
      const entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter((e) => !e.name.startsWith('.'))
        .map((e) => {
          const full = path.join(dir, e.name)
          let mtime = 0
          try {
            mtime = fs.statSync(full).mtimeMs
          } catch {}
          return { name: e.name, path: full, isDirectory: e.isDirectory(), mtime }
        })
        .sort((a, b) => b.mtime - a.mtime)
      return {
        total: entries.length,
        entries: entries.slice(0, limit).map((e) => ({
          name: e.name,
          path: e.path,
          isDirectory: e.isDirectory,
          icon: utools.getFileIcon(e.isDirectory ? 'folder' : e.path),
          src:
            !e.isDirectory && IMAGE_EXTS.includes(path.extname(e.name).slice(1).toLowerCase())
              ? pathToFileURL(e.path).href
              : null,
        })),
      }
    } catch (e) {
      return { total: 0, entries: [], error: String(e.message || e) }
    }
  },
  addTodo(text, clipId) {
    send('overlay:add-todo', text, clipId)
  },
  focus() {
    send('overlay:focus')
  },
  /** 勾选 / 取消勾选待办卡片里的一行（只标记完成，不删除） */
  todoToggle(cardId, lineId) {
    send('overlay:todo-toggle', cardId, lineId)
  },
  todoDelete(cardId, lineId) {
    send('overlay:todo-delete', cardId, lineId)
  },
  /** 在卡片上直接加一条 */
  todoAdd(cardId, text) {
    send('overlay:todo-add', cardId, text)
  },
  /** 一键完成整张卡片 */
  todoComplete(cardId) {
    send('overlay:todo-complete', cardId)
  },
  /** 用户拉下晾衣绳时：如果开了「滑出时获取焦点」，让悬浮层获得焦点（官方文档建议的保证渲染帧率的做法） */
  focusOnReveal() {
    send('overlay:focus-on-reveal')
  },
  /** 挂件 api.storage 的数据交给主界面保存 */
  saveWidgetData(id, data) {
    send('overlay:widget-data', id, data)
  },
  notify(text) {
    send('overlay:notify', text)
  },
  /** 挂件运行报错，记到设置页对应扩展下 */
  reportWidgetError(ext, message, line, fatal) {
    send('overlay:widget-error', ext, message, line, fatal)
  },
  copyImage: (filePath) => utools.copyImage(filePath),
  copyText: (text) => utools.copyText(text),
  copyFile: (filePath) => utools.copyFile(filePath),
  openPath: (filePath) => utools.shellOpenPath(filePath),
  openExternal: (url) => utools.shellOpenExternal(url),
  startDrag: (filePath) => utools.startDrag(filePath),
  isDarkColors: () => utools.isDarkColors(),
}
