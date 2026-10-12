import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import { clampSize, DATA_MAX, HANDLE_TEXT_MAX, sanitizeTree, type HandleContent, type LineOp, type WidgetExtension, type WidgetNode } from './protocol'
import { getRunner } from './runner'

export interface WidgetHost {
  copy(text: string): void
  open(url: string): void
  notify(text: string): void
  /** ctx.storage.set 后的完整数据 */
  saveData?(data: Record<string, unknown>): void
  /** ctx.line.*：控制晾衣绳（编辑器预览里可以不实现） */
  line?(op: LineOp, value?: boolean): void
  /** ctx.handle.*：收起后小把手上的内容 */
  handle?(value: HandleContent | null): void
  /** fatal：挂件已被停止（死循环、无法启动） */
  onError?(message: string, line?: number, fatal?: boolean): void
}

/** 每种 ctx 调用的最小间隔（ms），超出的丢弃并记一条错误 */
const RATE_LIMIT: Partial<Record<string, number>> = { notify: 5000, reveal: 10000, copy: 500, open: 2000 }

const str = (v: unknown, max: number) => String(v ?? '').slice(0, max)

function currentTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

let instanceSeq = 0

interface Props {
  ext: Pick<WidgetExtension, 'code' | 'settings' | 'width' | 'height'>
  /** 只在启动时读取；之后的变化由挂件自己维护 */
  data?: Record<string, unknown>
  host: WidgetHost
  /** 主题变化时变化，通知挂件 */
  themeKey?: unknown
}

/** 运行一个挂件实例，并用宿主自己的组件渲染它交出的元素树 */
export function WidgetView({ ext, data, host, themeKey }: Props) {
  const hostRef = useRef(host)
  const [initialData] = useState(data)
  const [id] = useState(() => `w${++instanceSeq}`)
  const [tree, setTree] = useState<WidgetNode | null>(null)
  /** 被停止的那次运行；代码变了重新运行时自然失效 */
  const [stoppedKey, setStoppedKey] = useState<string | null>(null)
  /** 脚本里 ctx.size 设置的尺寸；代码变了就作废 */
  const [override, setOverride] = useState<{ key: string; width: number; height: number } | null>(null)
  const { code, settings } = ext
  const runKey = `${code}\u0000${settings}`
  const size = override?.key === runKey ? override : clampSize(ext.width, ext.height)
  const stopped = stoppedKey === runKey

  useEffect(() => {
    hostRef.current = host
  })

  // 代码或设置变了就重启实例；卸载时停掉并撤销它对晾衣绳和把手的占用
  useEffect(() => {
    const runner = getRunner()
    const h = () => hostRef.current
    let parsed: unknown
    try {
      parsed = settings.trim() ? JSON.parse(settings) : {}
    } catch (e) {
      h().onError?.(`设置不是合法的 JSON：${(e as Error).message}`, undefined, true)
      return
    }
    const lastCall = new Map<string, number>()
    const allow = (key: string) => {
      const gap = RATE_LIMIT[key]
      if (!gap) return true
      const now = Date.now()
      if (now - (lastCall.get(key) ?? 0) < gap) {
        h().onError?.(`调用太频繁，已忽略：${key}（至少间隔 ${gap / 1000} 秒）`)
        return false
      }
      lastCall.set(key, now)
      return true
    }
    const release = () => {
      h().line?.('keepOpen', false)
      h().line?.('focus', false)
      h().handle?.(null)
    }

    runner.start(id, { code, settings: parsed, data: initialData ?? {}, theme: currentTheme() }, (m) => {
      const host = h()
      switch (m.type) {
        case 'tree': {
          const next = sanitizeTree(m.tree)
          if (next) setTree(next)
          else host.onError?.('渲染函数返回的内容无法显示（元素不认识，或数量、层级超限）')
          break
        }
        case 'size':
          setOverride({ key: runKey, ...clampSize(m.width, m.height) })
          break
        case 'data': {
          const json = JSON.stringify(m.data ?? {})
          if (json.length > DATA_MAX) host.onError?.(`ctx.storage 数据超过 ${DATA_MAX / 1024}KB，没有保存`)
          else host.saveData?.(JSON.parse(json))
          break
        }
        case 'copy':
          if (allow('copy')) host.copy(str(m.text, 10000))
          break
        case 'open': {
          const url = str(m.url, 2000)
          if (!/^https?:\/\//i.test(url)) host.onError?.(`ctx.open 只支持 http / https 链接：${url}`)
          else if (allow('open')) host.open(url)
          break
        }
        case 'notify':
          if (allow('notify')) host.notify(str(m.text, 200))
          break
        case 'line': {
          const op = m.op as LineOp
          if (!['keepOpen', 'collapse', 'reveal', 'focus'].includes(op)) break
          if (op === 'reveal' && !allow('reveal')) break
          host.line?.(op, m.value === true)
          break
        }
        case 'handle': {
          const v = m.value as HandleContent | null
          if (!v || typeof v !== 'object') {
            host.handle?.(null)
            break
          }
          const text = v.text == null ? undefined : Array.from(str(v.text, 100)).slice(0, HANDLE_TEXT_MAX).join('')
          const progress = typeof v.progress === 'number' ? Math.min(1, Math.max(0, v.progress)) : undefined
          host.handle?.({ text, progress })
          break
        }
        case 'error':
          host.onError?.(str(m.message, 500), typeof m.line === 'number' ? m.line : undefined, m.fatal === true)
          if (m.fatal) {
            setStoppedKey(runKey)
            release()
          }
          break
      }
    })
    return () => {
      runner.stop(id)
      release()
    }
  }, [id, code, settings, runKey, initialData])

  useEffect(() => {
    getRunner().setTheme(currentTheme())
  }, [themeKey])

  const click = (handler?: string) => handler && getRunner().dispatch(id, handler)

  return (
    <div className="relative overflow-hidden" style={{ width: size.width, height: size.height }}>
      {stopped ? (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">挂件已停止</div>
      ) : (
        tree && <Node node={tree} onClick={click} root />
      )}
    </div>
  )
}

const TEXT_SIZE: Record<string, number> = { xs: 11, sm: 12, md: 13, lg: 15, xl: 18, '2xl': 24, '3xl': 30 }
const ALIGN: Record<string, CSSProperties['alignItems']> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' }
const JUSTIFY: Record<string, CSSProperties['justifyContent']> = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
}

/** 宿主自己的固定组件：只认 protocol.ts 校验过的元素和属性 */
function Node({ node, onClick, root }: { node: WidgetNode; onClick(handler?: string): void; root?: boolean }) {
  switch (node.type) {
    case 'box':
      return (
        <div
          className="flex min-h-0 min-w-0 overflow-hidden"
          style={{
            flexDirection: node.direction,
            gap: node.gap,
            padding: node.padding,
            alignItems: ALIGN[node.align],
            justifyContent: JUSTIFY[node.justify],
            background: node.background ?? 'transparent',
            borderRadius: node.radius,
            flexGrow: node.grow ? 1 : undefined,
            flexWrap: node.wrap ? 'wrap' : undefined,
            width: node.width ?? (root ? '100%' : undefined),
            height: node.height ?? (root ? '100%' : undefined),
          }}
        >
          {node.children.map((c, i) => (
            <Node key={i} node={c} onClick={onClick} />
          ))}
        </div>
      )
    case 'text':
      return (
        <div
          className={cn('min-w-0 break-words', node.mono && 'font-mono tabular-nums', node.strike && 'line-through')}
          style={{
            fontSize: TEXT_SIZE[node.size],
            lineHeight: node.size === '2xl' || node.size === '3xl' ? 1.1 : 1.35,
            fontWeight: node.weight === 'bold' ? 650 : node.weight === 'medium' ? 500 : 400,
            color: node.color ?? 'var(--foreground)',
            textAlign: node.align,
            display: '-webkit-box',
            WebkitLineClamp: node.lines,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            letterSpacing: node.mono ? '-0.02em' : undefined,
          }}
        >
          {node.text}
        </div>
      )
    case 'image':
      return (
        <img
          src={node.src}
          draggable={false}
          className="shrink-0"
          style={{ width: node.width, height: node.height, objectFit: node.fit, borderRadius: node.radius }}
        />
      )
    case 'button':
      return (
        <button
          disabled={node.disabled}
          onClick={() => onClick(node.onClick)}
          className={cn(
            'shrink-0 rounded-lg border font-medium whitespace-nowrap transition disabled:opacity-50',
            node.size === 'sm' ? 'px-2.5 py-0.5 text-xs' : 'px-3 py-1 text-sm',
            node.variant === 'primary' && 'border-transparent bg-primary text-primary-foreground hover:bg-primary/90',
            node.variant === 'secondary' && 'border-border bg-muted text-foreground hover:bg-muted/70',
            node.variant === 'ghost' && 'border-transparent text-foreground hover:bg-muted',
          )}
        >
          {node.label}
        </button>
      )
    case 'progress':
      return (
        <div className="w-full shrink-0 overflow-hidden rounded-full bg-muted" style={{ height: node.height }}>
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${node.value * 100}%`, background: node.color ?? 'var(--primary)' }}
          />
        </div>
      )
    case 'spacer':
      return <div className="shrink-0" style={node.size === undefined ? { flexGrow: 1 } : { width: node.size, height: node.size }} />
  }
}
