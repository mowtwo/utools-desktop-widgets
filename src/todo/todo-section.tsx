import { useState } from 'react'
import { Check, CheckCheck, ListTodo, Plus, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TODO_LINES, TODO_MAX, type LineState, type TodoItem } from '@/types/line'
import { cn } from '@/lib/utils'
import { TODO_COLOR_IDS, TODO_COLORS } from './colors'

/** 设置页的待办管理：每张卡片的条目、颜色、快速添加的目标，新建卡片 */
export function TodoSection({ line }: { line: LineState }) {
  const services = window.services!
  const cards = line.items.filter((it): it is TodoItem => it.type === 'todo').sort((a, b) => a.createdAt - b.createdAt)
  const latest = [...cards].sort((a, b) => b.createdAt - a.createdAt)[0]
  const targetId = cards.some((c) => c.id === line.todoTarget) ? line.todoTarget : (latest?.id ?? null)
  const undone = cards.reduce((n, c) => n + c.lines.filter((l) => !l.done).length, 0)

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ListTodo className="size-4 text-muted-foreground" />
          待办
          {undone > 0 && <Badge variant="secondary">{undone} 条未完成</Badge>}
        </div>
        <Button variant="outline" size="sm" onClick={() => services.newTodoCard()}>
          <Plus /> 新建待办卡
        </Button>
      </div>
      {cards.length === 0 ? (
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          还没有待办卡。在 uTools 里输入文字后选「挂个待办」，或者在上面写一条，会自动建第一张；之后要不要新建由你决定。
        </p>
      ) : (
        <div className="flex flex-col gap-3 border-t p-4">
          {cards.map((card, i) => (
            <TodoCardEditor key={card.id} card={card} index={i} isTarget={card.id === targetId} />
          ))}
          <p className="text-xs text-muted-foreground">
            「挂个待办」和上面的输入框会加到标着「快速添加」的那张卡片里；它满 {TODO_LINES} 条后不会自动新建，删掉几条或新建一张再加。
          </p>
        </div>
      )}
    </section>
  )
}

function TodoCardEditor({ card, index, isTarget }: { card: TodoItem; index: number; isTarget: boolean }) {
  const services = window.services!
  const [text, setText] = useState('')
  const palette = TODO_COLORS[card.color] ?? TODO_COLORS.amber
  const full = card.lines.length >= TODO_LINES

  const add = () => {
    if (text.trim() && services.addTodoLine(card.id, text)) setText('')
  }

  return (
    <div className={cn('rounded-lg border p-3', palette.card)}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs font-medium">
          待办卡 {index + 1}
          <span className="ml-1 opacity-60">
            {card.lines.length}/{TODO_LINES}
          </span>
        </span>
        {isTarget ? (
          <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-medium dark:bg-white/15">快速添加</span>
        ) : (
          <button className="text-[10px] underline-offset-2 opacity-60 hover:underline hover:opacity-100" onClick={() => services.setTodoTarget(card.id)}>
            设为快速添加
          </button>
        )}
        <div className="flex-1" />
        <div className="flex gap-1">
          {TODO_COLOR_IDS.map((c) => (
            <button
              key={c}
              title={TODO_COLORS[c].label}
              onClick={() => services.setTodoColor(card.id, c)}
              className={cn('size-4 rounded-full ring-offset-1 transition', card.color === c && 'ring-2 ring-foreground/60')}
              style={{ background: TODO_COLORS[c].swatch }}
            />
          ))}
        </div>
        <button
          title="全部标成已完成"
          disabled={!card.lines.some((l) => !l.done)}
          className="opacity-50 hover:opacity-100 disabled:opacity-20"
          onClick={() => services.completeTodoCard(card.id)}
        >
          <CheckCheck className="size-3.5" />
        </button>
        <button title="移除这张卡片" className="opacity-50 hover:opacity-100" onClick={() => services.removeItem(card.id)}>
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {card.lines.map((l) => (
          <div key={l.id} className="group flex items-center gap-2 text-sm">
            <button
              title={l.done ? '标记为未完成' : '标记为完成'}
              onClick={() => services.toggleTodoLine(card.id, l.id)}
              className={cn(
                'flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px]',
                l.done ? 'border-emerald-500 bg-emerald-500 text-white' : palette.ring,
              )}
            >
              {l.done && <Check className="size-2.5" strokeWidth={4} />}
            </button>
            <span className={cn('min-w-0 flex-1 truncate', l.done && 'line-through opacity-50')}>{l.text}</span>
            <button title="删除" className="opacity-0 group-hover:opacity-60 hover:!opacity-100" onClick={() => services.removeTodoLine(card.id, l.id)}>
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          add()
        }}
      >
        <Input
          value={text}
          maxLength={TODO_MAX}
          disabled={full}
          onChange={(e) => setText(e.target.value)}
          placeholder={full ? `已满 ${TODO_LINES} 条，删掉几条再加` : '加一条（最多 30 字）'}
          className="h-7 bg-background/70 text-xs"
        />
        <Button type="submit" size="sm" variant="secondary" disabled={full || !text.trim()}>
          加上
        </Button>
      </form>
    </div>
  )
}
