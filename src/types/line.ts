import type { WidgetExtension } from '@/widget/runtime'

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

/** 用户的文件或文件夹（文件夹挂成可展开的衣架）：只记路径，移除时不动原文件 */
export interface FileItem extends ItemBase {
  type: 'file'
  path: string
  name: string
  isDirectory?: boolean
  icon: string
  /** 图片文件直接显示缩略图 */
  src: string | null
}

/** 挂件扩展的一个实例 */
export interface WidgetItem extends ItemBase {
  type: 'widget'
  /** 扩展 id */
  ext: string
  /** 挂件 api.storage 的数据 */
  data?: Record<string, unknown>
}

/** 快速便签：一条小待办，点完成就掉下去销毁 */
export interface TodoItem extends ItemBase {
  type: 'todo'
  text: string
}

export const TODO_MAX = 30

/** 点绳子加的空夹子，等着挂东西 */
export interface ClipItem extends ItemBase {
  type: 'clip'
}

export type ContentItem = ImageItem | NoteItem | FileItem

export type LineItem = ContentItem | WidgetItem | TodoItem | ClipItem

export const isContent = (it: LineItem): it is ContentItem =>
  it.type === 'image' || it.type === 'note' || it.type === 'file'

export type LineMode = 'auto' | 'pinned'

export type HandlePosition = 'left' | 'center' | 'right'

export interface LineState {
  enabled: boolean
  mode: LineMode
  displayId: number | null
  activeDisplayId: number
  /** 选中的屏幕不在了，暂时显示在主屏 */
  displayFallback: boolean
  maxItems: number
  /** null 表示自动 */
  handle: HandlePosition | null
  /** 当前屏幕是刘海屏 */
  notch: boolean
  /** 自动隐藏的收起延迟（ms） */
  hideDelay: number
  /** 内置扩展是否已写入数据库 */
  seeded: boolean
  /** 诊断面板开关（只在开发模式下生效） */
  debugHud: boolean
  /** 每个扩展在悬浮层里的运行报错 */
  extErrors: Record<string, ExtError[]>
  items: LineItem[]
  extensions: WidgetExtension[]
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
  notch: boolean
  handle: HandlePosition
  hideDelay: number
  extensions: WidgetExtension[]
  /** 开发模式下显示诊断面板 */
  debug: boolean
}

export interface ExtError {
  time: number
  message: string
  line?: number
  /** 挂件被停止（死循环、无法启动） */
  fatal: boolean
  /** 连续出现的次数 */
  count: number
}

/** 文件夹衣架展开后的一项 */
export interface FolderEntry {
  name: string
  path: string
  isDirectory: boolean
  icon: string
  src: string | null
}
