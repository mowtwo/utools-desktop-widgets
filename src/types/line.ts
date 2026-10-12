interface ItemBase {
  id: string
  createdAt: number
  /** 在绳子上的位置，占绳长的比例 */
  x: number
}

/** 截图、粘贴的图片：保存在插件本地数据目录，移除时一起删除 */
export interface ImageItem extends ItemBase {
  type: 'image'
  path: string
  src: string
}

/** 文字便签；内容是链接时双击打开 */
export interface NoteItem extends ItemBase {
  type: 'note'
  text: string
}

/** 用户的文件：只记路径，移除时不动原文件 */
export interface FileItem extends ItemBase {
  type: 'file'
  path: string
  name: string
  icon: string
  /** 图片文件直接显示缩略图 */
  src: string | null
}

export interface ClockItem extends ItemBase {
  type: 'clock'
}

/** 点绳子加的空夹子，等着挂东西 */
export interface ClipItem extends ItemBase {
  type: 'clip'
}

export type ContentItem = ImageItem | NoteItem | FileItem

export type LineItem = ContentItem | ClockItem | ClipItem

export const isContent = (it: LineItem): it is ContentItem =>
  it.type === 'image' || it.type === 'note' || it.type === 'file'

export type LineMode = 'auto' | 'pinned'

export interface LineState {
  enabled: boolean
  mode: LineMode
  displayId: number | null
  activeDisplayId: number
  /** 选中的屏幕不在了，暂时显示在主屏 */
  displayFallback: boolean
  maxItems: number
  clock: boolean
  items: LineItem[]
}

export interface DisplayInfo {
  id: number
  label: string
  width: number
  height: number
  scaleFactor: number
  primary: boolean
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayPayload {
  mode: LineMode
  items: LineItem[]
  bounds: Rect
  topInset: number
}
