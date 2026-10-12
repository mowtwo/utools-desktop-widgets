import { useSyncExternalStore } from 'react'
import type { LineState } from '@/types/line'

const fallback: LineState = {
  enabled: false,
  mode: 'auto',
  displayId: null,
  activeDisplayId: 0,
  displayFallback: false,
  maxItems: 12,
  clock: true,
  items: [],
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
