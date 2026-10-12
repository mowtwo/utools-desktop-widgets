import { useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Puzzle, Save, Send, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CodeEditor } from '@/components/code-editor'
import { TEMPLATE } from '@/widget/builtins'
import { AiPanel } from '@/widget/ai-panel'
import { WidgetDocsDialog } from '@/widget/docs-dialog'
import type { ExtError } from '@/types/line'
import type { WidgetExtension } from '@/widget/protocol'
import { WidgetView, type WidgetHost } from '@/widget/WidgetView'
import { cn } from '@/lib/utils'

type Draft = Omit<WidgetExtension, 'id'> & { id?: string }

const toDraft = (ext: WidgetExtension): Draft => ({ ...ext })

/** 停止输入一会儿后再刷新预览，免得每敲一个字都重建沙箱 */
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setV(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return v
}

interface PageProps {
  extensions: WidgetExtension[]
  /** 每个扩展在悬浮层里的运行报错 */
  extErrors: Record<string, ExtError[]>
  dark: boolean
}

export function ExtensionsPage({ extensions, extErrors, dark }: PageProps) {
  const services = window.services!
  const [selected, setSelected] = useState<string | null>(extensions[0]?.id ?? null)
  const [draft, setDraft] = useState<Draft | null>(() => (extensions[0] ? toDraft(extensions[0]) : null))
  const [dirty, setDirty] = useState(false)
  /** 预览报的错，按预览内容分组：代码一改旧错误就不再显示 */
  const [errorLog, setErrorLog] = useState<{ key: string; list: string[] }>({ key: '', list: [] })
  const [showAi, setShowAi] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const edit = (patch: Partial<Draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setDirty(true)
  }

  const save = (): string | null => {
    if (!draft) return null
    try {
      const id = services.saveExtension(draft)
      setDraft((d) => (d ? { ...d, id } : d))
      setSelected(id)
      setDirty(false)
      return id
    } catch (e) {
      setMessage(`保存失败：${(e as Error).message}`)
      return null
    }
  }

  const select = (ext: WidgetExtension) => {
    // 切换前自动保存当前的改动
    if (dirty) save()
    setSelected(ext.id)
    setDraft(toDraft(ext))
    setDirty(false)
    setConfirmDelete(false)
  }

  const create = () => {
    if (dirty) save()
    setSelected(null)
    setDraft({ ...TEMPLATE })
    setDirty(true)
  }

  // ⌘S / Ctrl+S 保存
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(null), 2000)
    return () => clearTimeout(timer)
  }, [message])

  const preview = useDebounced(draft, 500)
  const previewKey = `${preview?.code}\u0000${preview?.settings}`
  const previewKeyRef = useRef(previewKey)
  useEffect(() => {
    previewKeyRef.current = previewKey
  }, [previewKey])
  const errors = errorLog.key === previewKey ? errorLog.list : []

  const host = useMemo<WidgetHost>(
    () => ({
      copy: (text) => window.utools?.copyText(text),
      open: (url) => void window.utools?.shellOpenExternal(url),
      notify: (text) => window.utools?.showNotification(text),
      onError: (msg, line) =>
        setErrorLog((log) => {
          const key = previewKeyRef.current
          const list = log.key === key ? log.list : []
          return { key, list: [...list.slice(-4), line ? `第 ${line} 行：${msg}` : msg] }
        }),
    }),
    [],
  )

  return (
    <div className="flex h-full min-h-0 gap-4">
      <aside className="flex w-40 shrink-0 flex-col gap-1">
        {extensions.map((ext) => (
          <button
            key={ext.id}
            onClick={() => select(ext)}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-muted',
              selected === ext.id && 'bg-muted font-medium',
            )}
          >
            <Puzzle className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{ext.name}</span>
            {extErrors[ext.id]?.length ? (
              <span className="ml-auto size-1.5 shrink-0 rounded-full bg-destructive" title="悬浮层里有报错" />
            ) : null}
          </button>
        ))}
        <Button variant="ghost" size="sm" className="justify-start" onClick={create}>
          <Plus /> 新建挂件
        </Button>
      </aside>

      {draft ? (
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input className="flex-1" value={draft.name} onChange={(e) => edit({ name: e.target.value })} placeholder="挂件名称" />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              宽
              <Input
                type="number"
                className="w-16"
                value={draft.width}
                onChange={(e) => edit({ width: Number(e.target.value) })}
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              高
              <Input
                type="number"
                className="w-16"
                value={draft.height}
                onChange={(e) => edit({ height: Number(e.target.value) })}
              />
            </label>
            <Button variant={showAi ? 'secondary' : 'ghost'} size="sm" onClick={() => setShowAi(!showAi)}>
              <Sparkles /> AI 帮写
            </Button>
            <WidgetDocsDialog />
          </div>

          {showAi && <AiPanel draft={draft} errors={errors} onApply={edit} />}

          <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_180px] gap-3">
            <div className="flex min-h-0 flex-col gap-2">
              <CodeEditor className="min-h-0 flex-1" value={draft.code} onChange={(code) => edit({ code })} dark={dark} />
              <div className="text-xs font-medium text-muted-foreground">设置（JSON，脚本里用 ctx.settings 读取）</div>
              <CodeEditor
                className="h-24 shrink-0"
                json
                value={draft.settings}
                onChange={(settings) => edit({ settings })}
                dark={dark}
              />
            </div>

            <div className="flex min-h-0 flex-col gap-2">
              <div className="text-xs font-medium text-muted-foreground">预览</div>
              <div className="flex min-h-36 items-center justify-center rounded-lg border bg-[linear-gradient(135deg,#bae6fd,#e9d5ff)] p-3 dark:bg-[linear-gradient(135deg,#1e293b,#312e81)]">
                {preview && (
                  <div className="rounded-[16px] border border-white/50 bg-background/85 p-1 shadow dark:border-white/15">
                    <WidgetView ext={preview} host={host} themeKey={dark} />
                  </div>
                )}
              </div>
              {errors.length > 0 && (
                <div className="max-h-28 overflow-auto rounded-md bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
                  {errors.map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              )}
              {draft.id && extErrors[draft.id]?.length ? (
                <RuntimeErrors errors={extErrors[draft.id]} onClear={() => services.clearExtErrors(draft.id!)} />
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => save() && setMessage('已保存')} disabled={!dirty}>
              <Save /> 保存{dirty && ' *'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const id = dirty || !draft.id ? save() : draft.id
                if (id) {
                  services.hangWidget(id)
                  setMessage('已挂到绳子上')
                }
              }}
            >
              <Send /> 挂到绳子上
            </Button>
            {message && <span className="text-xs text-muted-foreground">{message}</span>}
            <div className="flex-1" />
            {draft.id && (
              <Button
                variant={confirmDelete ? 'destructive' : 'ghost'}
                onClick={() => {
                  if (!confirmDelete) {
                    setConfirmDelete(true)
                    return
                  }
                  services.removeExtension(draft.id!)
                  const next = extensions.find((e) => e.id !== draft.id)
                  setSelected(next?.id ?? null)
                  setDraft(next ? toDraft(next) : null)
                  setDirty(false)
                  setConfirmDelete(false)
                }}
              >
                <Trash2 /> {confirmDelete ? '再点一次删除（绳上的实例也会取下）' : '删除'}
              </Button>
            )}
          </div>
        </section>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
          还没有挂件扩展
          <Button variant="outline" size="sm" onClick={create}>
            <Plus /> 新建一个
          </Button>
        </div>
      )}
    </div>
  )
}

/** 挂件在悬浮层里运行时的报错（预览里的报错显示在预览下面） */
function RuntimeErrors({ errors, onClear }: { errors: ExtError[]; onClear(): void }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/30 p-2">
      <div className="flex items-center justify-between text-[11px] font-medium text-destructive">
        悬浮层里的报错
        <button className="text-muted-foreground hover:text-foreground" onClick={onClear}>
          清空
        </button>
      </div>
      <div className="max-h-32 overflow-auto font-mono text-[11px] leading-snug">
        {[...errors].reverse().map((e) => (
          <div key={`${e.time}-${e.message}`} className={cn('py-0.5', e.fatal ? 'text-destructive' : 'text-muted-foreground')}>
            <span className="text-muted-foreground/70">{new Date(e.time).toLocaleTimeString('zh-CN', { hour12: false })} </span>
            {e.line ? `第 ${e.line} 行：` : ''}
            {e.message}
            {e.count > 1 && <span className="text-muted-foreground/70"> ×{e.count}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
