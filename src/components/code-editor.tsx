import { useEffect, useRef } from 'react'
import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { javascript } from '@codemirror/lang-javascript'
import { Compartment, EditorState } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, hoverTooltip } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { CTX_MEMBERS, ENTRY, UI_ELEMENTS } from '@/widget/spec'
import { cn } from '@/lib/utils'

const fnKind = (signature: string) => (signature.includes('(') ? 'function' : 'property')

/** ctx.xxx / ctx.line.xxx 的成员：按路径前缀分组 */
function ctxMembers(prefix: string): Completion[] {
  const depth = prefix.split('.').length
  return CTX_MEMBERS.filter((m) => m.path.startsWith(prefix + '.') && m.path.split('.').length === depth + 1).map((m) => ({
    label: m.path.slice(prefix.length + 1),
    detail: m.signature,
    info: m.doc,
    type: fnKind(m.signature),
  }))
}

/** 光标是不是在 ui.xxx( … { 的选项对象里：返回元素名和已经输入的属性名 */
function propContext(before: string) {
  // 找最近一个还没闭合的 ui.xxx(
  const calls = [...before.matchAll(/ui\.(\w+)\(/g)]
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]
    const rest = before.slice(call.index! + call[0].length)
    let parens = 1
    let braces = 0
    for (const ch of rest) {
      if (ch === '(') parens++
      else if (ch === ')') parens--
      else if (ch === '{') braces++
      else if (ch === '}') braces--
      if (parens === 0) break
    }
    if (parens > 0 && braces > 0) return { element: call[1], rest }
    if (parens > 0) return null
  }
  return null
}

/** 补全：defineWidget、ctx.*、ui.*、ui 元素的选项属性和取值 */
function widgetCompletions(context: CompletionContext) {
  const line = context.state.doc.lineAt(context.pos)
  const start = Math.max(0, context.pos - 2000)
  const before = context.state.sliceDoc(start, context.pos)

  const member = context.matchBefore(/(ctx(?:\.\w+)*|ui)\.\w*/)
  if (member) {
    const dot = member.text.lastIndexOf('.')
    const owner = member.text.slice(0, dot)
    const options =
      owner === 'ui'
        ? UI_ELEMENTS.map((el) => ({ label: el.name, detail: el.signature, info: el.doc, type: 'function' }))
        : ctxMembers(owner)
    if (options.length) return { from: member.from + dot + 1, options }
  }

  const prop = propContext(before)
  if (prop) {
    const el = UI_ELEMENTS.find((e) => e.name === prop.element)
    if (!el) return null
    // 属性值：xxx: '
    const value = /(\w+)\s*:\s*(['"])(\w*)$/.exec(prop.rest)
    if (value) {
      const p = el.props.find((x) => x.name === value[1])
      if (!p?.values) return null
      return {
        from: context.pos - value[3].length,
        options: p.values.map((v) => ({ label: v, detail: p.type, type: 'enum' })),
      }
    }
    // 属性名：在 { 或 , 后面
    const name = context.matchBefore(/\w*/)
    if (name && /[{,]\s*\w*$/.test(prop.rest)) {
      return {
        from: name.from,
        options: el.props.map((p) => ({ label: p.name, detail: p.type, info: p.doc, type: 'property' })),
      }
    }
    return null
  }

  const word = context.matchBefore(/\w+/)
  if (word && 'defineWidget'.startsWith(word.text) && word.text.length >= 3 && line.text.trim().startsWith(word.text)) {
    return { from: word.from, options: [{ label: ENTRY.path, detail: ENTRY.signature, info: ENTRY.doc, type: 'function' }] }
  }
  return null
}

/** 悬停在 ctx.xxx / ui.xxx / defineWidget 上时显示签名和说明 */
const widgetHover = hoverTooltip((view, pos) => {
  const line = view.state.doc.lineAt(pos)
  const offset = pos - line.from
  for (const m of line.text.matchAll(/(ctx(?:\.\w+)+|ui\.\w+|defineWidget)/g)) {
    const from = m.index!
    const to = from + m[0].length
    if (offset < from || offset > to) continue
    let signature = ''
    let doc = ''
    if (m[0] === 'defineWidget') ({ signature, doc } = ENTRY)
    else if (m[0].startsWith('ui.')) {
      const el = UI_ELEMENTS.find((e) => e.name === m[0].slice(3))
      if (el) ({ signature, doc } = el)
    } else {
      // ctx.a.b 悬停在哪一段就显示哪一段
      const parts = m[0].split('.')
      let acc = 0
      let path = parts[0]
      for (let i = 1; i < parts.length; i++) {
        acc = path.length + 1 + parts[i].length
        path = `${path}.${parts[i]}`
        if (offset - from <= acc) break
      }
      const member = CTX_MEMBERS.find((c) => c.path === path)
      if (member) ({ signature, doc } = member)
    }
    if (!signature) return null
    return {
      pos: line.from + from,
      end: line.from + to,
      above: true,
      create() {
        const dom = document.createElement('div')
        dom.className = 'cm-widget-hover'
        const sig = document.createElement('code')
        sig.textContent = signature
        const text = document.createElement('div')
        text.textContent = doc
        dom.append(sig, text)
        return { dom }
      },
    }
  }
  return null
})

interface Props {
  value: string
  onChange(value: string): void
  dark: boolean
  /** true 时只做 JSON 编辑（设置），不加挂件 API 补全 */
  json?: boolean
  className?: string
}

export function CodeEditor({ value, onChange, dark, json, className }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const theme = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  // 外部换掉 value 时也会触发 docChanged，那不是用户的编辑，不能回调 onChange（否则一切换扩展就标成未保存）
  const syncing = useRef(false)

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
          ...(json ? [] : [autocompletion({ override: [widgetCompletions] }), widgetHover]),
          theme.current.of(dark ? oneDark : []),
          EditorView.updateListener.of((u) => {
            if (u.docChanged && !syncing.current) onChangeRef.current(u.state.doc.toString())
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '12px', backgroundColor: 'transparent' },
            '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
            '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
            '.cm-widget-hover': { padding: '6px 8px', maxWidth: '360px', fontSize: '12px', lineHeight: '1.5' },
            '.cm-widget-hover code': { display: 'block', fontWeight: '600', marginBottom: '2px' },
          }),
        ],
      }),
    })
    return () => view.current?.destroy()
    // 只在挂载时创建；之后外部 value 的变化在下面同步
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 切换到另一个扩展、或 AI 写入新代码时，外部 value 会整个换掉
  useEffect(() => {
    const v = view.current
    if (v && v.state.doc.toString() !== value) {
      syncing.current = true
      try {
        v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } })
      } finally {
        syncing.current = false
      }
    }
  }, [value])

  useEffect(() => {
    view.current?.dispatch({ effects: theme.current.reconfigure(dark ? oneDark : []) })
  }, [dark])

  return <div ref={host} className={cn('overflow-hidden rounded-lg border bg-background', className)} />
}
