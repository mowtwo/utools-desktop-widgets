// 悬浮层自定义窗口 preload：只做与插件应用主界面之间的消息桥接
const { ipcRenderer } = require('electron')

const displayId = Number(new URLSearchParams(location.search).get('display'))

window.overlay = {
  displayId,
  onSettings(listener) {
    ipcRenderer.on('overlay:settings', (_e, payload) => listener(payload))
  },
  ready() {
    utools.sendToParent('overlay:ready', displayId)
  },
  /** 鼠标进入挂件时关闭点击穿透，离开时恢复 */
  setInteractive(interactive) {
    utools.sendToParent('overlay:interactive', displayId, interactive)
  },
  /** x / y 为屏幕全局坐标 */
  moveWidget(id, x, y) {
    utools.sendToParent('overlay:widget-moved', id, x, y)
  },
}
