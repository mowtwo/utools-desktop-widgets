// 拉绳：垂在晾衣绳一端（跟着小把手在哪边），在自动分组之间切换。
// 拉一下或单击换下一组，滚轮前后翻，右键回到全部；只在晾衣绳展开时出现
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cn } from '@/lib/utils'
import type { AutoGroup } from './groups'
import { glass } from './styles'

/** 拉多远算拉了一下（px） */
const PULL_TRIGGER = 14
/** 最多能拉下来多长（px） */
const PULL_MAX = 34
/** 绳子平时的长度（px） */
const CORD_LENGTH = 30

interface Props {
  /** 第一项是「全部」 */
  groups: AutoGroup[]
  active: string
  /** 拉一下（1）或滚轮往回翻（-1） */
  onPull(step: 1 | -1): void
  /** 右键：回到全部 */
  onReset(): void
  /** 挂在哪一端：坠子朝屏幕内侧展开，不会伸出屏幕 */
  side: 'left' | 'right'
}

export function Cord({ groups, active, onPull, onReset, side }: Props) {
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const start = useRef<{ y: number; moved: boolean } | null>(null)
  const wheelAt = useRef(0)
  const index = Math.max(0, groups.findIndex((g) => g.key === active))
  const current = groups[index]
  const next = groups[(index + 1) % groups.length]

  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    start.current = { y: e.clientY, moved: false }
    setDragging(true)
  }
  const onMove = (e: ReactPointerEvent) => {
    const s = start.current
    if (!s) return
    const dy = e.clientY - s.y
    if (Math.abs(dy) > 3) s.moved = true
    // 越往下越拉不动
    setPull(Math.max(0, Math.min(PULL_MAX, dy * (1 - Math.max(0, dy) / (PULL_MAX * 4)))))
  }
  const end = (fire: boolean) => {
    const s = start.current
    start.current = null
    if (fire && s && (!s.moved || pull >= PULL_TRIGGER)) onPull(1)
    setPull(0)
    setDragging(false)
  }

  return (
    <div className={cn('flex flex-col', side === 'left' ? 'items-start' : 'items-end')}>
      {/* 绳子：拉的时候跟着变长，松手弹回；挂在坠子靠屏幕边缘的那一头 */}
      <div
        className="mx-3.5 w-[1.5px] rounded-full bg-neutral-500/60"
        style={{ height: CORD_LENGTH + pull, transition: dragging ? 'none' : 'height 380ms cubic-bezier(.34,1.6,.64,1)' }}
      />
      <div
        data-hit
        title={`拉一下：换到「${next.label}」\n滚轮：前后翻\n右键：回到全部`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={() => end(true)}
        onPointerCancel={() => end(false)}
        onContextMenu={(e) => {
          e.preventDefault()
          onReset()
        }}
        onWheel={(e) => {
          // 触控板一次滑动会连发很多事件：间隔太近的只算一次
          if (Math.abs(e.deltaY) < 4 || e.timeStamp - wheelAt.current < 350) return
          wheelAt.current = e.timeStamp
          onPull(e.deltaY > 0 ? 1 : -1)
        }}
        className={cn(
          'flex h-6 cursor-grab touch-none items-center gap-1.5 rounded-full px-2.5 text-[11px] font-medium shadow-[0_2px_6px_rgba(0,0,0,0.18)] select-none active:cursor-grabbing',
          'transition-[scale] duration-150 hover:scale-105',
          glass,
        )}
      >
        <span className="whitespace-nowrap">
          {current.label}
          <span className="ml-1 text-muted-foreground tabular-nums">{current.count}</span>
        </span>
        {groups.length > 2 && (
          <span className="flex items-center gap-[3px]">
            {groups.map((g, i) => (
              <span key={g.key} className={cn('size-[4px] rounded-full', i === index ? 'bg-foreground/80' : 'bg-foreground/25')} />
            ))}
          </span>
        )}
      </div>
    </div>
  )
}
