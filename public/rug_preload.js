// 桌面地毯窗口 preload：光标位置、点击穿透切换、把窗口推到最底层等交给插件应用主界面执行
const fs = require('node:fs')
const path = require('node:path')

const logFile = path.join(require('./capabilities.js').dataDir(), 'debug.log')

function log(event, detail) {
  try {
    const line = `${new Date().toISOString()} rug ${event}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}\n`
    fs.appendFileSync(logFile, line)
  } catch {}
}

window.addEventListener('error', (e) => log('error', { message: e.message, line: e.lineno }))

const { ipcRenderer } = require('electron')

/** 这张地毯所在的屏幕：每块屏幕可以各铺一张，发给主界面的消息都带上它 */
const DISPLAY = Number(new URLSearchParams(location.search).get('display'))
const send = (channel, ...args) => utools.sendToParent(channel, DISPLAY, ...args)

window.rugBridge = {
  log,
  /** 页面准备好了：主界面据此把窗口显示出来（创建回调可能丢失） */
  ready() {
    send('rug:ready')
  },
  onEdit(listener) {
    ipcRenderer.on('rug:edit', (_e, on) => listener(on))
  },
  endEdit() {
    send('rug:end-edit')
  },
  cursor: () => utools.getCursorScreenPoint(),
  setAccept(accept) {
    send('rug:accept', accept)
  },
  pushBack() {
    send('rug:back')
  },
  saveMaterial(id) {
    send('rug:material', id)
  },
  hide() {
    send('rug:hide')
  },
}
