// 晾衣绳的尺寸，数值参考 tendedero（MIT）的 LineView.swift，见 NOTICE

export const CARD_WIDTH = 150
export const PHOTO_MAX_HEIGHT = 104
export const SPACING = CARD_WIDTH + 24
export const PANEL_HEIGHT = PHOTO_MAX_HEIGHT + 106
export const ROPE_TOP = 10
/** 夹子顶端高出绳子的距离 */
export const PIN_ABOVE = 9.5

/** 空绳子大致的下垂量（px），物理模拟据此定绳长 */
export function sag(width: number) {
  return Math.min(30, width * 0.018)
}

/** 每件东西都挂得有点歪，由 id 决定，重绘时不乱跳 */
export function tiltOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(h) % 1000) / 1000) * 5 - 2.5
}
