import { useEffect, useRef, useState } from 'react'
import { Loader2, Sparkles, Square, Undo2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { widgetSkill } from './docs-dialog'
import type { WidgetExtension } from './protocol'
import { parseAiReply } from './spec'

type Draft = Omit<WidgetExtension, 'id'> & { id?: string }

const MODEL_KEY = 'widget-ai-model'
/** 对话最多带上几轮历史，免得越聊越贵 */
const HISTORY_TURNS = 3

interface Props {
  draft: Draft
  /** 预览里当前的报错，可以一键交给 AI 修 */
  errors: string[]
  onApply(patch: Partial<Draft>): void
}

function describe(draft: Draft) {
  return `当前挂件（用户要修改就在这个基础上改；要全新的挂件可以整个重写）：
名称：${draft.name}
尺寸：${draft.width}x${draft.height}

\`\`\`json
${draft.settings || '{}'}
\`\`\`

\`\`\`js
${draft.code}
\`\`\``
}

/** 用 uTools 自带的 AI 帮忙写挂件：system 提示词是挂件 skill 文档 */
export function AiPanel({ draft, errors, onApply }: Props) {
  const [models, setModels] = useState<UToolsAiModel[]>([])
  const [model, setModel] = useState<string>(() => {
    try {
      return localStorage.getItem(MODEL_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [prompt, setPrompt] = useState('')
  const [output, setOutput] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [undo, setUndo] = useState<Partial<Draft> | null>(null)
  const history = useRef<UToolsAiMessage[]>([])
  const running = useRef<UToolsAiPromise<void> | null>(null)

  useEffect(() => {
    window.utools
      ?.allAiModels()
      .then(setModels)
      .catch(() => setModels([]))
  }, [])

  useEffect(() => () => running.current?.abort(), [])

  const send = async (request: string) => {
    if (!window.utools || busy || !request.trim()) return
    const user: UToolsAiMessage = { role: 'user', content: `${request.trim()}\n\n${describe(draft)}` }
    const messages: UToolsAiMessage[] = [{ role: 'system', content: widgetSkill() }, ...history.current.slice(-HISTORY_TURNS * 2), user]
    let text = ''
    setBusy(true)
    setOutput('')
    setNotice(null)
    try {
      const task = window.utools.ai({ model: model || undefined, messages }, (chunk) => {
        if (chunk.content) {
          text += chunk.content
          setOutput(text)
        }
      })
      running.current = task
      await task
      history.current = [...history.current, user, { role: 'assistant', content: text }]
      const reply = parseAiReply(text)
      if (!reply.code) {
        setNotice('AI 没有按格式给出代码，可以换个说法再试')
        return
      }
      setUndo({ name: draft.name, width: draft.width, height: draft.height, settings: draft.settings, code: draft.code })
      onApply({
        code: reply.code,
        ...(reply.name ? { name: reply.name } : {}),
        ...(reply.width && reply.height ? { width: reply.width, height: reply.height } : {}),
        ...(reply.settings !== undefined ? { settings: reply.settings } : {}),
      })
      setNotice('已写入编辑器，看看预览；满意就保存')
      setPrompt('')
    } catch (e) {
      setNotice(text ? '已停止' : `调用失败：${(e as Error)?.message ?? e}`)
    } finally {
      running.current = null
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-2.5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">AI 帮写</span>
        <div className="flex-1" />
        {models.length > 0 && (
          <Select
            value={model && models.some((m) => m.id === model) ? model : undefined}
            onValueChange={(v) => {
              setModel(v)
              try {
                localStorage.setItem(MODEL_KEY, v)
              } catch {
                // 本地存储不可用时只是不记住选择
              }
            }}
          >
            <SelectTrigger size="sm" className="h-7 w-40 text-xs">
              <SelectValue placeholder="默认模型" />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          void send(prompt)
        }}
      >
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send(prompt)
            }
          }}
          rows={2}
          placeholder="说说想要什么挂件，比如：显示距离周五还有几天；或者：把按钮改成绿色（⌘↵ 发送）"
          className="min-h-0 flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex flex-col gap-1">
          {busy ? (
            <Button type="button" size="sm" variant="outline" onClick={() => running.current?.abort()}>
              <Square /> 停止
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!prompt.trim()}>
              <Sparkles /> 生成
            </Button>
          )}
          {errors.length > 0 && !busy && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="把预览里的报错交给 AI 修"
              onClick={() => void send(`预览运行时报错了，请修复：\n${errors.join('\n')}`)}
            >
              <Wrench /> 修报错
            </Button>
          )}
        </div>
      </form>
      {(busy || output) && (
        <pre className="max-h-24 overflow-auto rounded-md bg-background p-2 font-mono text-[10.5px] leading-snug whitespace-pre-wrap text-muted-foreground">
          {busy && !output ? <Loader2 className="size-3 animate-spin" /> : output}
        </pre>
      )}
      {notice && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {notice}
          {undo && !busy && (
            <button
              className="flex items-center gap-1 text-foreground hover:underline"
              onClick={() => {
                onApply(undo)
                setUndo(null)
                setNotice('已撤销 AI 的修改')
              }}
            >
              <Undo2 className="size-3" /> 撤销
            </button>
          )}
        </div>
      )}
    </div>
  )
}
