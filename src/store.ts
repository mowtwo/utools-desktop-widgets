import { create } from 'zustand'
import type { Settings, Widget } from '@/types/settings'
import { defaultWidgets, loadSettings, saveSettings } from '@/lib/settings'

interface State extends Settings {
  setOverlayEnabled(enabled: boolean): void
  updateWidget(id: string, patch: Partial<Widget>): void
  resetWidget(id: string): void
}

function commit(next: Settings) {
  saveSettings(next)
  if (next.overlayEnabled) window.services?.showOverlays(next)
  else window.services?.hideOverlays()
}

export const useStore = create<State>((set, get) => {
  const apply = (patch: Partial<Settings>) => {
    set(patch)
    const { overlayEnabled, widgets } = get()
    commit({ overlayEnabled, widgets })
  }
  return {
    ...loadSettings(),
    setOverlayEnabled: (overlayEnabled) => apply({ overlayEnabled }),
    updateWidget: (id, patch) =>
      apply({ widgets: get().widgets.map((w) => (w.id === id ? ({ ...w, ...patch } as Widget) : w)) }),
    resetWidget: (id) => {
      const def = defaultWidgets.find((w) => w.id === id)
      if (def) get().updateWidget(id, { x: def.x, y: def.y })
    },
  }
})

/** 让悬浮层与已保存的设置保持一致（插件启动、重新进入时调用） */
export function syncOverlays() {
  const { overlayEnabled, widgets } = useStore.getState()
  commit({ overlayEnabled, widgets })
}
