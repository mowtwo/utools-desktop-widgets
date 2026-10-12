// 晾衣绳的尺寸与排布，数值参考 tendedero（MIT）的 LineView.swift

export const CARD_WIDTH = 150
export const PHOTO_MAX_HEIGHT = 104
export const SPACING = CARD_WIDTH + 24
export const PANEL_HEIGHT = PHOTO_MAX_HEIGHT + 106
export const ROPE_TOP = 10
/** 夹子顶端高出绳子的距离 */
export const PIN_ABOVE = 9.5

/** 绳子从屏幕一边垂到另一边，呈抛物线 */
export function sag(width: number) {
  return Math.min(30, width * 0.018)
}

export function ropeY(x: number, width: number) {
  if (width <= 0) return ROPE_TOP
  const f = x / width
  return ROPE_TOP + 4 * sag(width) * f * (1 - f)
}

/** 居中排开；放不下时收窄间距，保证都不出屏 */
export function itemX(index: number, count: number, width: number) {
  const gaps = Math.max(count - 1, 0)
  const step = gaps > 0 ? Math.min(SPACING, Math.max(0, width - 200) / gaps) : SPACING
  return width / 2 - (gaps * step) / 2 + index * step
}

/** 每件东西都挂得有点歪，由 id 决定，重绘时不乱跳 */
export function tiltOf(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(h) % 1000) / 1000) * 5 - 2.5
}
