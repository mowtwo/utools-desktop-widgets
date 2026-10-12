// 挂件渲染协议：挂件只能交出由固定元素组成的树，宿主逐个校验后用自己的组件渲染
// 不认识的元素、属性、取值一律丢掉，超出范围的数值夹到范围内

export interface WidgetExtension {
  id: string
  name: string
  code: string
  /** 默认尺寸（px），脚本里可用 ctx.size 调整，超出范围会被夹住 */
  width: number
  height: number
  /** 传给脚本的 ctx.settings，JSON 字符串 */
  settings: string
  builtin?: boolean
  updatedAt?: number
}

export interface HandleContent {
  /** 最多 HANDLE_TEXT_MAX 个字，纯文本 */
  text?: string
  /** 0 ~ 1 */
  progress?: number
}

export type LineOp = 'keepOpen' | 'collapse' | 'reveal' | 'focus'

export const WIDGET_MIN = { width: 40, height: 24 }
export const WIDGET_MAX = { width: 320, height: 260 }
export const WIDGET_DEFAULT = { width: 136, height: 64 }
export const HANDLE_TEXT_MAX = 12
/** ctx.storage 的数据上限（JSON 字符数） */
export const DATA_MAX = 32 * 1024
export const TREE_MAX_NODES = 200
export const TREE_MAX_DEPTH = 8
const TEXT_MAX = 500

/** 尺寸：非法值回退到默认，超出范围夹住 */
export function clampSize(w: unknown, h: unknown) {
  const pick = (v: unknown, min: number, max: number, def: number) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? Math.round(Math.min(max, Math.max(min, n))) : def
  }
  return {
    width: pick(w, WIDGET_MIN.width, WIDGET_MAX.width, WIDGET_DEFAULT.width),
    height: pick(h, WIDGET_MIN.height, WIDGET_MAX.height, WIDGET_DEFAULT.height),
  }
}

// ---------- 校验后的元素 ----------

type Align = 'start' | 'center' | 'end' | 'stretch'
type Justify = 'start' | 'center' | 'end' | 'between'
export type TextSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'

export interface BoxNode {
  type: 'box'
  direction: 'row' | 'column'
  gap: number
  padding: number
  align: Align
  justify: Justify
  /** 背景色；默认透明 */
  background?: string
  radius: number
  grow: boolean
  wrap: boolean
  width?: number
  height?: number
  children: WidgetNode[]
}

export interface TextNode {
  type: 'text'
  text: string
  size: TextSize
  weight: 'normal' | 'medium' | 'bold'
  color?: string
  mono: boolean
  align: 'start' | 'center' | 'end'
  /** 最多显示几行，超出省略 */
  lines: number
  strike: boolean
}

export interface ImageNode {
  type: 'image'
  src: string
  width: number
  height: number
  fit: 'cover' | 'contain'
  radius: number
}

export interface ButtonNode {
  type: 'button'
  label: string
  /** 沙箱里点击回调的编号 */
  onClick?: string
  variant: 'primary' | 'secondary' | 'ghost'
  size: 'sm' | 'md'
  disabled: boolean
}

export interface ProgressNode {
  type: 'progress'
  value: number
  color?: string
  height: number
}

export interface SpacerNode {
  type: 'spacer'
  /** 不给就占满剩余空间 */
  size?: number
}

export type WidgetNode = BoxNode | TextNode | ImageNode | ButtonNode | ProgressNode | SpacerNode

// ---------- 校验 ----------

const COLOR_TOKENS: Record<string, string> = {
  fg: 'var(--foreground)',
  muted: 'var(--muted-foreground)',
  primary: 'var(--primary)',
  accent: 'var(--muted)',
  danger: 'var(--destructive)',
  success: '#16a34a',
  warning: '#d97706',
}
const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** 颜色只认主题色名或十六进制 */
function color(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined
  if (v in COLOR_TOKENS) return COLOR_TOKENS[v]
  return HEX.test(v) ? v : undefined
}

function oneOf<T extends string>(v: unknown, options: readonly T[], def: T): T {
  return options.includes(v as T) ? (v as T) : def
}

function num(v: unknown, min: number, max: number, def: number) {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

function optNum(v: unknown, min: number, max: number) {
  return v === undefined || v === null ? undefined : num(v, min, max, min)
}

/** 图片只允许 https 和图片 data URL（在 <img> 里，SVG 里的脚本也不会执行） */
function imageSrc(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 2_000_000) return null
  if (/^https:\/\//i.test(v)) return v
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i.test(v)) return v
  return null
}

type Raw = { type?: unknown; props?: Record<string, unknown>; children?: unknown }

/** 把沙箱交出的树校验成宿主能渲染的树；返回 null 表示整棵不可用 */
export function sanitizeTree(raw: unknown): WidgetNode | null {
  let count = 0
  const walk = (node: unknown, depth: number): WidgetNode | null => {
    if (!node || typeof node !== 'object' || depth > TREE_MAX_DEPTH || ++count > TREE_MAX_NODES) return null
    const { type, props = {}, children } = node as Raw
    const p = props && typeof props === 'object' ? props : {}
    switch (type) {
      case 'box':
        return {
          type: 'box',
          direction: oneOf(p.direction, ['row', 'column'] as const, 'column'),
          gap: num(p.gap, 0, 24, 0),
          padding: num(p.padding, 0, 24, 0),
          align: oneOf(p.align, ['start', 'center', 'end', 'stretch'] as const, 'stretch'),
          justify: oneOf(p.justify, ['start', 'center', 'end', 'between'] as const, 'start'),
          background: color(p.background),
          radius: num(p.radius, 0, 16, 0),
          grow: p.grow === true,
          wrap: p.wrap === true,
          width: optNum(p.width, 0, WIDGET_MAX.width),
          height: optNum(p.height, 0, WIDGET_MAX.height),
          children: Array.isArray(children)
            ? children.map((c) => walk(c, depth + 1)).filter((c): c is WidgetNode => c !== null)
            : [],
        }
      case 'text':
        return {
          type: 'text',
          text: String(children ?? '').slice(0, TEXT_MAX),
          size: oneOf(p.size, ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'] as const, 'sm'),
          weight: oneOf(p.weight, ['normal', 'medium', 'bold'] as const, 'normal'),
          color: color(p.color),
          mono: p.mono === true,
          align: oneOf(p.align, ['start', 'center', 'end'] as const, 'start'),
          lines: Math.round(num(p.lines, 1, 6, 3)),
          strike: p.strike === true,
        }
      case 'image': {
        const src = imageSrc(p.src)
        if (!src) return null
        return {
          type: 'image',
          src,
          width: num(p.width, 8, WIDGET_MAX.width, 48),
          height: num(p.height, 8, WIDGET_MAX.height, 48),
          fit: oneOf(p.fit, ['cover', 'contain'] as const, 'cover'),
          radius: num(p.radius, 0, 16, 6),
        }
      }
      case 'button':
        return {
          type: 'button',
          label: String(children ?? '').slice(0, 40),
          onClick: typeof p.onClick === 'string' ? p.onClick : undefined,
          variant: oneOf(p.variant, ['primary', 'secondary', 'ghost'] as const, 'secondary'),
          size: oneOf(p.size, ['sm', 'md'] as const, 'sm'),
          disabled: p.disabled === true,
        }
      case 'progress':
        return {
          type: 'progress',
          value: num(p.value, 0, 1, 0),
          color: color(p.color),
          height: num(p.height, 2, 12, 4),
        }
      case 'spacer':
        return { type: 'spacer', size: optNum(p.size, 0, 200) }
      default:
        return null
    }
  }
  return walk(raw, 0)
}
