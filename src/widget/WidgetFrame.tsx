import { useEffect, useMemo, useRef, useState } from 'react'
import { buildWidgetDoc, clampSize, currentTheme, themeVars, type WidgetExtension, type WidgetMessage } from './runtime'

export interface WidgetHost {
  copy(text: string): void
  open(url: string): void
  notify(text: string): void
  /** api.storage.set 后的完整数据 */
  saveData?(data: Record<string, unknown>): void
  onError?(message: string, line?: number): void
}

interface Props {
  ext: Pick<WidgetExtension, 'code' | 'settings' | 'width' | 'height'>
  /** 只在挂载时读取；之后的变化由挂件自己维护 */
  data?: Record<string, unknown>
  host: WidgetHost
  /** 主题变化时递增，通知沙箱 */
  themeKey?: unknown
}

/** 在沙箱 iframe 里运行一个挂件扩展 */
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
    if (error) hostRef.current.onError?.(error)
  }, [error])

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || !e.data?.__widget) return
      const m = e.data as WidgetMessage
      const h = hostRef.current
      switch (m.type) {
        case 'size':
          setOverride({ doc: docRef.current, ...clampSize(m.width, m.height) })
          break
        case 'data':
          h.saveData?.(m.data)
          break
        case 'copy':
          h.copy(m.text)
          break
        case 'open':
          // 只放行网页链接
          if (/^https?:\/\//i.test(m.url)) h.open(m.url)
          else h.onError?.(`api.open 只支持 http / https 链接：${m.url}`)
          break
        case 'notify':
          h.notify(m.text)
          break
        case 'error':
          h.onError?.(m.message, m.line)
          break
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
