import type { WidgetExtension } from '@/widget/protocol'

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

export interface TodoLine {
  id: string
  text: string
  /** 已完成：划线显示，不会自动删除 */
  done: boolean
}

export type TodoColor = 'amber' | 'rose' | 'sky' | 'emerald' | 'violet'

/** 待办卡片：最多 TODO_LINES 行（已完成的也算）；勾选只标记完成，删除是单独的按钮 */
export interface TodoItem extends ItemBase {
  type: 'todo'
  lines: TodoLine[]
  color: TodoColor
}

/** 每行最多几个字 */
export const TODO_MAX = 30
/** 每张卡片最多几行 */
export const TODO_LINES = 6

/** 点绳子加的空夹子，等着挂东西 */
export interface ClipItem extends ItemBase {
  type: 'clip'
}

export type ContentItem = ImageItem | NoteItem | FileItem

export type LineItem = ContentItem | WidgetItem | TodoItem | ClipItem

export const isContent = (it: LineItem): it is ContentItem =>
  it.type === 'image' || it.type === 'note' || it.type === 'file'

export type LineMode = 'auto' | 'pinned'

export interface RugSettings {
  enabled: boolean
  material: string
  quality: 'high' | 'medium' | 'low'
  precision: 'fine' | 'standard' | 'eco'
  /** 铺地毯的屏幕 id；空表示跟着晾衣绳那块屏幕 */
  displays: number[]
}

export interface PingSettings {
  /** lol：英雄联盟原版素材；open：开源素材 */
  style: 'lol' | 'open'
  /** 原版风格的轮盘：从正上方开始顺时针的 8 个信号 id */
  lolWheel: string[]
  /** 开源风格的轮盘 */
  wheel: string[]
  /** 信号停留时长（ms） */
  duration: number
  /** 开源风格的音效包 */
  soundPack: 'digital' | 'interface'
  /** 截图尺寸（DIP） */
  width: number
  height: number
  /** 信号图标大小（逻辑像素） */
  size: number
  /** 轮盘缩放比例 0.5 ~ 1 */
  wheelScale: number
  output: 'none' | 'copy' | 'hang' | 'both'
  sound: boolean
}

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
  /** 试验：拉下时让悬浮层获得焦点 */
  focusOnReveal: boolean
  /** 渲染保活点 */
  renderAnchor: boolean
  /** 每块屏幕一根晾衣绳 */
  multiLine: boolean
  ping: PingSettings
  rug: RugSettings
  /** 地毯正在编辑 */
  rugEditing: boolean
  /** 快速添加待办的目标卡片；null 表示最新的一张 */
  todoTarget: string | null
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
  /** line：这块屏幕上挂着晾衣绳；ping：只用来发信号（别的屏幕上按了信号快捷键时临时打开） */
  role: 'line' | 'ping'
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
  /** 渲染保活点 */
  renderAnchor: boolean
  ping: PingSettings
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
