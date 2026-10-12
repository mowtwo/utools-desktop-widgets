import { useSyncExternalStore } from 'react'
import type { LineState } from '@/types/line'

const fallback: LineState = {
  enabled: false,
  mode: 'auto',
  displayId: null,
  activeDisplayId: 0,
  displayFallback: false,
  maxItems: 12,
  handle: null,
  notch: false,
  hideDelay: 800,
  seeded: false,
  debugHud: false,
  extErrors: {},
  focusOnReveal: false,
  renderAnchor: true,
  ping: { style: 'lol', lolWheel: [], wheel: [], duration: 1600, soundPack: 'digital', width: 480, height: 300, icon: 'md', output: 'copy', sound: false },
  rug: { enabled: false, material: 'persian', quality: 'medium', precision: 'standard' },
  items: [],
  extensions: [],
}

let cached: LineState = window.services?.getState() ?? fallback

function subscribe(onChange: () => void) {
  if (!window.services) return () => {}
  return window.services.subscribe((state) => {
    cached = state
    onChange()
  })
}

/** 设置页订阅 preload 里的晾衣绳状态 */
export function useLine() {
  return useSyncExternalStore(subscribe, () => cached)
}
