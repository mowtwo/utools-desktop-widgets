import { useState } from 'react'
import { Check } from 'lucide-react'
import type { TodoItem } from '@/types/line'
import { cn } from '@/lib/utils'
import { CARD_WIDTH } from './layout'

interface Props {
  item: TodoItem
  /** 完成：交给外层播放掉落动画，再真正取下 */
  onDone(): void
}

/** 快速便签：一条小待办，点圆圈完成 */
export function TodoCard({ item, onDone }: Props) {
  const [done, setDone] = useState(false)
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-[14px] border border-amber-300/60 bg-amber-50/95 px-2.5 py-2 text-amber-950',
        'shadow-[0_5px_10px_rgba(0,0,0,0.16)] dark:border-amber-200/20 dark:bg-amber-950/90 dark:text-amber-50',
      )}
      style={{ width: CARD_WIDTH - 14 }}
    >
      <button
        data-hit
        title="完成"
        disabled={done}
        onClick={() => {
          setDone(true)
          // 先让勾选显示一下再掉下去
          setTimeout(onDone, 350)
        }}
        className={cn(
          'mt-px flex size-4 shrink-0 items-center justify-center rounded-full border-[1.5px] border-amber-600/60 transition',
          'hover:border-amber-600 hover:bg-amber-500/15 dark:border-amber-200/50',
          done && 'border-emerald-500 bg-emerald-500 text-white',
        )}
      >
        {done && <Check className="size-2.5" strokeWidth={3.5} />}
      </button>
      <span className={cn('text-xs leading-snug break-words transition', done && 'line-through opacity-50')}>
        {item.text}
      </span>
    </div>
  )
}
