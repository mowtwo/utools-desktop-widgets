// 悬浮层自定义窗口 preload
// - 与插件应用主界面之间的消息桥接（改动状态的操作都交给主界面执行）
// - 轮询光标位置：鼠标顶到屏幕上边缘时滑出晾衣绳（macOS 菜单栏盖在悬浮层上面，收不到 mousemove）
// - 复制、打开、拖出等只读操作直接在这里执行
const { ipcRenderer, webUtils } = require('electron')

const CURSOR_POLL_MS = 60

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
  /** 每 60ms 回调一次光标的屏幕坐标（DIP） */
  watchCursor(listener) {
    const timer = setInterval(() => listener(utools.getCursorScreenPoint()), CURSOR_POLL_MS)
    return () => clearInterval(timer)
  },
  copyImage: (filePath) => utools.copyImage(filePath),
  copyText: (text) => utools.copyText(text),
  copyFile: (filePath) => utools.copyFile(filePath),
  openPath: (filePath) => utools.shellOpenPath(filePath),
  openExternal: (url) => utools.shellOpenExternal(url),
  startDrag: (filePath) => utools.startDrag(filePath),
  isDarkColors: () => utools.isDarkColors(),
}
