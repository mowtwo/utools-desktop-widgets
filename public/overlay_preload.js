// 悬浮层自定义窗口 preload
// - 与插件应用主界面之间的消息桥接（改动状态的操作都交给主界面执行）
// - 轮询光标位置：鼠标顶到屏幕上边缘时滑出晾衣绳（macOS 菜单栏盖在悬浮层上面，收不到 mousemove）
// - 复制、打开、拖出等只读操作直接在这里执行
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { ipcRenderer, webUtils } = require('electron')

const CURSOR_POLL_MS = 60
const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif', 'tif', 'tiff', 'svg']

window.overlay = {
  onState(listener) {
    ipcRenderer.on('overlay:state', (_e, payload) => listener(payload))
  },
  /** duration：滑出后至少停留多久（ms） */
  onPeek(listener) {
    ipcRenderer.on('overlay:peek', (_e, duration) => listener(duration))
  },
  ready() {
    utools.sendToParent('overlay:ready')
  },
  /** 鼠标在挂件上时关闭点击穿透，离开时恢复 */
  setInteractive(interactive) {
    utools.sendToParent('overlay:interactive', interactive)
  },
  /** 请主界面让悬浮层整页重绘 */
  repaint() {
    utools.sendToParent('overlay:repaint')
  },
  remove(id) {
    utools.sendToParent('overlay:remove', id)
  },
  /** x：在绳子上的位置，占绳长的比例 */
  move(id, x) {
    utools.sendToParent('overlay:move', id, x)
  },
  addClip(x) {
    utools.sendToParent('overlay:add-clip', x)
  },
  /** source：files 选文件 / paste 剪贴板 / capture 截图 */
  fillClip(clipId, source) {
    utools.sendToParent('overlay:fill-clip', clipId, source)
  },
  /** 从系统拖进来的文件 */
  drop(files, x, clipId) {
    const paths = Array.from(files)
      .map((f) => webUtils.getPathForFile(f))
      .filter(Boolean)
    if (paths.length) utools.sendToParent('overlay:drop', paths, x, clipId)
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
      const next = listener(utools.getCursorScreenPoint())
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
    utools.sendToParent('overlay:add-todo', text, clipId)
  },
  focus() {
    utools.sendToParent('overlay:focus')
  },
  /** 挂件 api.storage 的数据交给主界面保存 */
  saveWidgetData(id, data) {
    utools.sendToParent('overlay:widget-data', id, data)
  },
  notify(text) {
    utools.sendToParent('overlay:notify', text)
  },
  copyImage: (filePath) => utools.copyImage(filePath),
  copyText: (text) => utools.copyText(text),
  copyFile: (filePath) => utools.copyFile(filePath),
  openPath: (filePath) => utools.shellOpenPath(filePath),
  openExternal: (url) => utools.shellOpenExternal(url),
  startDrag: (filePath) => utools.startDrag(filePath),
  isDarkColors: () => utools.isDarkColors(),
}
