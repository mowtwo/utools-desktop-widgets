import { useEffect, useMemo, useRef, useState } from 'react'
import {
  buildWidgetDoc,
  clampSize,
  currentTheme,
  DATA_MAX,
  HANDLE_TEXT_MAX,
  themeVars,
  type HandleContent,
  type LineOp,
  type WidgetExtension,
} from './runtime'

export interface WidgetHost {
  copy(text: string): void
  open(url: string): void
  notify(text: string): void
  /** api.storage.set 后的完整数据 */
  saveData?(data: Record<string, unknown>): void
  /** api.line.*：控制晾衣绳（编辑器预览里可以不实现） */
  line?(op: LineOp, value?: boolean): void
  /** api.handle.set：收起后小把手上的内容 */
  handle?(value: HandleContent | null): void
  /** fatal：挂件已被停止（死循环、无法启动） */
  onError?(message: string, line?: number, fatal?: boolean): void
}

/** 每种 api 调用的最小间隔（ms），超出的直接丢弃并记一条错误 */
const RATE_LIMIT: Partial<Record<string, number>> = { notify: 5000, reveal: 10000, copy: 500, open: 2000 }

interface Props {
  ext: Pick<WidgetExtension, 'code' | 'settings' | 'width' | 'height'>
  /** 只在挂载时读取；之后的变化由挂件自己维护 */
  data?: Record<string, unknown>
  host: WidgetHost
  /** 主题变化时变化，通知沙箱 */
  themeKey?: unknown
}

const str = (v: unknown, max: number) => String(v ?? '').slice(0, max)

/** 在沙箱里运行一个挂件扩展；沙箱发来的每条消息都先校验再交给宿主 */
export function WidgetFrame({ ext, data, host, themeKey }: Props) {
  const ref = useRef<HTMLIFrameElement>(null)
  const hostRef = useRef(host)
  /** 只在挂载时读取初始数据 */
  const [initialData] = useState(data)

  useEffect(() => {
    hostRef.current = host
  })

  // 只有代码或设置变了才重建沙箱（状态推送每次都是新对象，不能按引用比较）
  const { code, settings } = ext
  const { doc, error } = useMemo(() => {
    try {
      return { doc: buildWidgetDoc({ code, settings }, initialData ?? {}), error: null }
    } catch (e) {
      return { doc: '', error: `设置不是合法的 JSON：${(e as Error).message}` }
    }
  }, [code, settings, initialData])

  // 脚本里 api.size / api.fit 设置的尺寸；沙箱重建后作废，回到扩展的默认尺寸
  const [override, setOverride] = useState<{ doc: string; width: number; height: number } | null>(null)
  const size = override?.doc === doc ? override : clampSize(ext.width, ext.height)
  const docRef = useRef(doc)
  useEffect(() => {
    docRef.current = doc
  }, [doc])

  useEffect(() => {
    if (error) hostRef.current.onError?.(error, undefined, true)
  }, [error])

  // 沙箱重建（代码变了）或卸载时，撤销它对晾衣绳和把手的占用
  useEffect(
    () => () => {
      const h = hostRef.current
      h.line?.('keepOpen', false)
      h.line?.('focus', false)
      h.handle?.(null)
    },
    [doc],
  )

  useEffect(() => {
    const lastCall = new Map<string, number>()
    /** 超出频率限制就丢弃 */
    const allow = (key: string) => {
      const gap = RATE_LIMIT[key]
      if (!gap) return true
      const now = Date.now()
      if (now - (lastCall.get(key) ?? 0) < gap) {
        hostRef.current.onError?.(`api 调用太频繁，已忽略：${key}（至少间隔 ${gap / 1000} 秒）`)
        return false
      }
      lastCall.set(key, now)
      return true
    }

    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !e.data?.__widget) return
      const h = hostRef.current
      // 宿主自己的代码也包一层：哪条消息处理出错都不能影响悬浮层
      try {
        const m = e.data as Record<string, unknown>
        switch (m.type) {
          case 'size':
            setOverride({ doc: docRef.current, ...clampSize(Number(m.width), Number(m.height)) })
            break
          case 'data': {
            const json = JSON.stringify(m.data ?? {})
            if (json.length > DATA_MAX) h.onError?.(`api.storage 数据超过 ${DATA_MAX / 1024}KB，没有保存`)
            else h.saveData?.(JSON.parse(json))
            break
          }
          case 'copy':
            if (allow('copy')) h.copy(str(m.text, 10000))
            break
          case 'open': {
            const url = str(m.url, 2000)
            if (!/^https?:\/\//i.test(url)) h.onError?.(`api.open 只支持 http / https 链接：${url}`)
            else if (allow('open')) h.open(url)
            break
          }
          case 'notify':
            if (allow('notify')) h.notify(str(m.text, 200))
            break
          case 'line': {
            const op = m.op as LineOp
            if (!['keepOpen', 'collapse', 'reveal', 'focus'].includes(op)) break
            if (op === 'reveal' && !allow('reveal')) break
            h.line?.(op, m.value === true)
            break
          }
          case 'handle': {
            const v = m.value as HandleContent | null
            if (v == null) {
              h.handle?.(null)
              break
            }
            const text = v.text == null ? undefined : Array.from(str(v.text, 100)).slice(0, HANDLE_TEXT_MAX).join('')
            const progress = typeof v.progress === 'number' ? Math.min(1, Math.max(0, v.progress)) : undefined
            h.handle?.({ text, progress })
            break
          }
          case 'error':
            h.onError?.(str(m.message, 500), typeof m.line === 'number' ? m.line : undefined, m.fatal === true)
            if (m.fatal) {
              h.line?.('keepOpen', false)
              h.line?.('focus', false)
              h.handle?.(null)
            }
            break
        }
      } catch (err) {
        h.onError?.(`处理挂件消息时出错：${(err as Error).message}`)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => {
    ref.current?.contentWindow?.postMessage({ type: 'theme', theme: currentTheme(), vars: themeVars() }, '*')
  }, [themeKey])

  if (error) return null
  return (
    <iframe
      ref={ref}
      sandbox="allow-scripts"
      srcDoc={doc}
      title="挂件"
      className="block border-0 bg-transparent"
      style={{ width: size.width, height: size.height, colorScheme: 'normal' }}
    />
  )
}
