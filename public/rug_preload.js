// 桌面地毯窗口 preload：光标位置、点击穿透切换、把窗口推到最底层等交给插件应用主界面执行
const fs = require('node:fs')
const path = require('node:path')

const logFile = path.join(utools.getPluginLocalDataPath(), 'debug.log')

function log(event, detail) {
  try {
    const line = `${new Date().toISOString()} rug ${event}${detail === undefined ? '' : ' ' + JSON.stringify(detail)}\n`
    fs.appendFileSync(logFile, line)
  } catch {}
}

window.addEventListener('error', (e) => log('error', { message: e.message, line: e.lineno }))

const { ipcRenderer } = require('electron')

window.rugBridge = {
  log,
  /** 页面准备好了：主界面据此把窗口显示出来（创建回调可能丢失） */
  ready() {
    utools.sendToParent('rug:ready')
  },
  onEdit(listener) {
    ipcRenderer.on('rug:edit', (_e, on) => listener(on))
  },
  endEdit() {
    utools.sendToParent('rug:end-edit')
  },
  cursor: () => utools.getCursorScreenPoint(),
  setAccept(accept) {
    utools.sendToParent('rug:accept', accept)
  },
  pushBack() {
    utools.sendToParent('rug:back')
  },
  saveMaterial(id) {
    utools.sendToParent('rug:material', id)
  },
  hide() {
    utools.sendToParent('rug:hide')
  },
}
