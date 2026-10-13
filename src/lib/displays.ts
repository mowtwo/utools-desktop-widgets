import type { DisplayInfo } from '@/types/line'

/** 设置页里屏幕的名字：系统给的名字（没有就按顺序编号）+ 分辨率 */
export function displayName(d: DisplayInfo, index: number) {
  const name = d.label || `屏幕 ${index + 1}`
  return `${name} · ${d.width}×${d.height}${d.primary ? ' · 主屏' : ''}`
}
