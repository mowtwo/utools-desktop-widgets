import type { Settings, Widget } from '@/types/settings'

const KEY = 'settings'

export const defaultWidgets: Widget[] = [
  { id: 'clock', type: 'clock', enabled: true, x: 80, y: 80, showSeconds: false },
]

export const defaultSettings: Settings = { overlayEnabled: false, widgets: defaultWidgets }

// 挂件开关和位置属于用户配置，存同步数据库（见官方文档「数据存储 / 用户数据」）
export function loadSettings(): Settings {
  const saved = window.utools?.dbStorage.getItem(KEY) as Partial<Settings> | null | undefined
  if (!saved) return defaultSettings
  // 新增的挂件类型合并进旧配置
  const widgets = defaultWidgets.map((def) => ({ ...def, ...saved.widgets?.find((w) => w.id === def.id) }))
  return { overlayEnabled: saved.overlayEnabled ?? false, widgets }
}

export function saveSettings(settings: Settings) {
  window.utools?.dbStorage.setItem(KEY, settings)
}
