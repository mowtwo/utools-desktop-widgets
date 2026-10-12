import { useEffect, useRef } from 'react'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { javascript } from '@codemirror/lang-javascript'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { API_MEMBERS } from '@/widget/builtins'
import { cn } from '@/lib/utils'

/** 输入 api. 时补全挂件 API */
function apiCompletions(context: CompletionContext) {
  const word = context.matchBefore(/api\.\w*/)
  if (!word || (word.from === word.to && !context.explicit)) return null
  return {
    from: word.from + 4,
    options: API_MEMBERS.map((d) => ({ label: d.name, detail: d.signature, info: d.doc, type: 'function' })),
  }
}

interface Props {
  value: string
  onChange(value: string): void
  dark: boolean
  /** true 时只做 JSON 编辑（设置），不加 api 补全 */
  json?: boolean
  className?: string
}

export function CodeEditor({ value, onChange, dark, json, className }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const theme = useRef(new Compartment())
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    onChangeRef.current = onChange
  })

  useEffect(() => {
    view.current = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          javascript(),
          ...(json ? [] : [autocompletion({ override: [apiCompletions] })]),
          theme.current.of(dark ? oneDark : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onChangeRef.current(u.state.doc.toString())
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '12px', backgroundColor: 'transparent' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
            '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
          }),
        ],
      }),
    })
    return () => view.current?.destroy()
    // 只在挂载时创建；之后外部 value 的变化在下面同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切换到另一个扩展时，外部 value 会整个换掉
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
    }
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : []) })
  }, [dark])

  return <div ref={host} className={cn('overflow-hidden rounded-lg border bg-background', className)} />
}
