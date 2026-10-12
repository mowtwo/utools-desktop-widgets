import { useState } from 'react'
import { Check, CheckCheck, Plus, X } from 'lucide-react'
import { TODO_LINES, TODO_MAX, type TodoItem } from '@/types/line'
import { TODO_COLORS } from '@/todo/colors'
import { cn } from '@/lib/utils'
import { CARD_WIDTH } from './layout'

/**
 * 待办卡片：最多 6 行；点圆圈标记完成（不删除），× 删除这一行；
 * 底部可以直接加一条、一键完成；取下整张卡片用通用的关闭按钮（条目删到 0 条时也会自动取下）
 */
export function TodoCard({ item }: { item: TodoItem }) {
  const o = window.overlay!
  const palette = TODO_COLORS[item.color] ?? TODO_COLORS.amber
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const full = item.lines.length >= TODO_LINES

  const startAdding = () => {
    // 要在悬浮层里打字，得先拿到键盘焦点
    o.focus()
    setAdding(true)
  }
  const submit = () => {
    if (text.trim()) o.todoAdd(item.id, text)
    setText('')
    setAdding(false)
  }

  return (
    <div
      // 整张卡片都接收鼠标：否则鼠标停在文字上时悬浮层会切回点击穿透，悬停出不来关闭按钮和删除 ×
      data-hit
      className={cn('flex flex-col gap-1 rounded-[14px] border px-2 py-1.5 shadow-[0_5px_10px_rgba(0,0,0,0.16)]', palette.card)}
      style={{ width: CARD_WIDTH - 14 }}
    >
      {item.lines.length === 0 && <div className="py-1 text-center text-[11px] opacity-60">空的待办卡</div>}
      {item.lines.map((line) => (
        <div key={line.id} className="group/line flex items-start gap-1.5">
          <button
            data-hit
            title={line.done ? '标记为未完成' : '标记为完成'}
            onClick={() => o.todoToggle(item.id, line.id)}
            className={cn(
              'mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full border-[1.5px] transition',
              line.done ? 'border-emerald-500 bg-emerald-500 text-white' : palette.ring,
            )}
          >
            {line.done && <Check className="size-2" strokeWidth={4} />}
          </button>
          <span className={cn('min-w-0 flex-1 text-[11.5px] leading-snug break-words', line.done && 'line-through opacity-45')}>
            {line.text}
          </span>
          <button
            data-hit
            title="删除这一条"
            onClick={() => o.todoDelete(item.id, line.id)}
            className="mt-px flex size-3.5 shrink-0 items-center justify-center rounded-full opacity-0 transition group-hover/line:opacity-60 hover:!opacity-100"
          >
            <X className="size-2.5" strokeWidth={3} />
          </button>
        </div>
      ))}

      {adding && (
        <form
          data-hit
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          <input
            autoFocus
            value={text}
            maxLength={TODO_MAX}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setText('')
                setAdding(false)
              }
            }}
            onBlur={() => !text.trim() && setAdding(false)}
            placeholder="回车加上，Esc 取消"
            className="w-full rounded-md border border-current/20 bg-white/70 px-1.5 py-0.5 text-[11px] outline-none dark:bg-black/20"
          />
        </form>
      )}

      <div className="mt-0.5 flex items-center gap-2 border-t border-current/10 pt-1 text-[10px]">
        {!full && !adding && (
          <button data-hit title="在这张卡片上加一条" onClick={startAdding} className="flex items-center gap-0.5 opacity-60 hover:opacity-100">
            <Plus className="size-3" />
            加一条
          </button>
        )}
        <div className="flex-1" />
        {item.lines.some((l) => !l.done) && (
          <button data-hit title="全部标成已完成" onClick={() => o.todoComplete(item.id)} className="flex items-center gap-0.5 opacity-60 hover:opacity-100">
            <CheckCheck className="size-3" />
            全部完成
          </button>
        )}
      </div>
    </div>
  )
}
