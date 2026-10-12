// 悬浮层自定义窗口 preload
// - 与插件应用主界面之间的消息桥接
// - 轮询光标位置：鼠标顶到屏幕上边缘时滑出晾衣绳（macOS 菜单栏盖在悬浮层上面，收不到 mousemove）
// - 复制、打开、拖出等只读操作直接在这里执行
const { ipcRenderer } = require('electron')

const CURSOR_POLL_MS = 60

window.overlay = {
  onState(listener) {
    ipcRenderer.on('overlay:state', (_e, payload) => listener(payload))
  },
  onPeek(listener) {
    ipcRenderer.on('overlay:peek', () => listener())
  },
  ready() {
    utools.sendToParent('overlay:ready')
  },
  /** 鼠标进入挂件时关闭点击穿透，离开时恢复 */
  setInteractive(interactive) {
    utools.sendToParent('overlay:interactive', interactive)
  },
  remove(id) {
    utools.sendToParent('overlay:remove', id)
  },
  hideClock() {
    utools.sendToParent('overlay:hide-clock')
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
