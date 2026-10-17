// 新版 uTools 才有的 API：用 @whatevertools/shared 做链式 fallback，旧版上退回替代实现或安静关掉对应功能，
// 而不是 preload 一加载就 `xxx is not a function`（uTools 8.0 之前没有 getPluginLocalDataPath、定时任务等）。
// wt-shared.js 是构建时从 @whatevertools/shared 拷进来的单文件（见 vite.config.ts）。
const os = require('node:os')
const path = require('node:path')
const { capability, method, report } = require('./wt-shared.js')

const UPGRADE = '请把 uTools 升级到最新版'
const u = () => utools

/**
 * 插件应用本地数据目录。旧版 uTools 没有 getPluginLocalDataPath 时依次退回到 uTools 的 userData 目录、用户主目录。
 * 顺序固定，同一台机器同一个 uTools 版本每次拿到的都是同一个目录；升级到新版后由 migrateDataDir 把数据搬过去。
 */
const FALLBACK_DATA_DIRS = [
  {
    id: 'userData',
    available: () => typeof utools.getPath === 'function' && !!utools.getPath('userData'),
    run: () => path.join(utools.getPath('userData'), 'plugin-data', 'desktop-widgets'),
  },
  { id: 'home', run: () => path.join(os.homedir(), '.utools-desktop-widgets') },
]
const dataDir = capability('paths.data', [method(u, 'getPluginLocalDataPath'), ...FALLBACK_DATA_DIRS], { hint: UPGRADE })

/** 旧版退回目录里可能有的数据目录（不管当前用的是哪个） */
function fallbackDataDirs() {
  return FALLBACK_DATA_DIRS.map((c) => {
    try {
      return (!c.available || c.available()) && c.run()
    } catch {
      return null
    }
  }).filter(Boolean)
}

/** 定时任务（「保持显示」）：旧版没有就关掉这个功能 */
const onScheduleTrigger = capability('schedule.onTrigger', [method(u, 'onScheduleTrigger')], { missing: 'noop' })
const requestSchedule = capability('schedule.request', [method(u, 'requestSchedule')], { hint: UPGRADE })
const getSchedules = capability('schedule.list', [method(u, 'getSchedules')], { hint: UPGRADE })
const removeSchedule = capability('schedule.remove', [method(u, 'removeSchedule')], { missing: 'noop' })

/** 功能指令绑定的全局快捷键：拿不到时当作没绑定 */
const getCmdHotKey = capability('hotkeys.get', [method(u, 'getCmdHotKey')], { missing: 'noop' })

/** 发信号时静默截屏 */
const captureDisplay = capability('screen.captureDisplay', [method(u, 'captureDisplay')], { hint: UPGRADE })

module.exports = {
  dataDir,
  fallbackDataDirs,
  onScheduleTrigger,
  requestSchedule,
  getSchedules,
  removeSchedule,
  getCmdHotKey,
  captureDisplay,
  report,
}
