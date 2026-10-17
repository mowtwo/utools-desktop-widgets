// 插件应用主界面 preload 入口：真正的逻辑在 preload-main.js。
// 这里只负责兜底：加载出错时把原因写进日志、交给界面显示，而不是只看到「请在 uTools 中打开」。
try {
  require('./preload-main.js')
} catch (err) {
  const message = (err && (err.stack || err.message)) || String(err)
  window.__preloadError = message
  try {
    const fs = require('node:fs')
    const path = require('node:path')
    const dir = require('./capabilities.js').dataDir()
    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(path.join(dir, 'debug.log'), `${new Date().toISOString()} main preload-failed ${JSON.stringify({ message, platform: process.platform, versions: process.versions })}\n`)
  } catch {}
}
