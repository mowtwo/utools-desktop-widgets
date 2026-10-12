import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Check, X } from 'lucide-react'
import type { LineItem } from '@/types/line'
import { cn } from '@/lib/utils'
import { CARD_WIDTH, PHOTO_MAX_HEIGHT, tiltOf } from './layout'
import { Clothespin } from './Rope'
import { arrive, nudge } from './swing'

export type Hangable = LineItem | { id: 'clock'; type: 'clock' }

const URL_RE = /^https?:\/\/\S+$/i
const INNER = CARD_WIDTH - 14

interface Props {
  item: Hangable
  /** 每次值变化，代表一阵风（晾衣绳滑下来时） */
  gust: number
}

function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function ClockFace() {
  const now = useNow()
  return (
    <div className="flex flex-col items-center px-2 py-3" style={{ width: INNER }}>
      <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight">
        {now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}
      </div>
    </div>
  )
}

function Photo({ src }: { src: string }) {
  return (
    <img
      src={src}
      draggable={false}
      className="block rounded-[12px] object-contain"
      style={{ maxWidth: INNER, maxHeight: PHOTO_MAX_HEIGHT }}
    />
  )
}

function Content({ item }: { item: Hangable }) {
  switch (item.type) {
    case 'clock':
      return <ClockFace />
    case 'image':
      return <Photo src={item.src} />
    case 'file':
      if (item.src) return <Photo src={item.src} />
      return (
        <div className="flex flex-col items-center gap-1.5 px-2 py-3" style={{ width: INNER }}>
          <img src={item.icon} draggable={false} className="size-12 object-contain" />
          <div className="line-clamp-2 w-full text-center text-xs break-all">{item.name}</div>
        </div>
      )
    case 'note':
      return (
        <div
          className={cn(
            'line-clamp-5 px-3 py-2.5 text-xs leading-relaxed whitespace-pre-wrap break-words',
            URL_RE.test(item.text) && 'text-blue-600 underline dark:text-blue-400',
          )}
          style={{ width: INNER, maxHeight: PHOTO_MAX_HEIGHT }}
        >
          {item.text}
        </div>
      )
  }
}

function copy(item: Hangable) {
  const o = window.overlay!
  switch (item.type) {
    case 'image':
      return o.copyImage(item.path)
    case 'file':
      return item.src ? o.copyImage(item.path) : o.copyFile(item.path)
    case 'note':
      return o.copyText(item.text)
    case 'clock':
      return false
  }
}

function open(item: Hangable) {
  const o = window.overlay!
  if (item.type === 'image' || item.type === 'file') void o.openPath(item.path)
  else if (item.type === 'note' && URL_RE.test(item.text)) void o.openExternal(item.text)
}

/** 夹在绳子上的一件东西：落下、摆动、被风吹；单击复制，双击打开，拖出去发送 */
export function Pegged({ item, gust }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const tilt = tiltOf(item.id)
  const [copied, setCopied] = useState(false)
  const draggable = item.type === 'image' || item.type === 'file'

  useLayoutEffect(() => {
    if (ref.current) arrive(ref.current, tilt)
  }, [tilt])

  useEffect(() => {
    if (gust && ref.current) nudge(ref.current, tilt, 1.6 + Math.random() * 1.8, Math.random() * 350)
  }, [gust, tilt])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <div ref={ref} className="origin-top" style={{ rotate: `${tilt}deg`, width: CARD_WIDTH }}>
      <Clothespin />
      <div className="group relative -mt-3 flex justify-center">
        <div
          data-hit
          draggable={draggable}
          onDragStart={() => {
            if (draggable) window.overlay?.startDrag(item.path)
          }}
          onClick={() => {
            if (copy(item)) setCopied(true)
            if (ref.current) nudge(ref.current, tilt, 3)
          }}
          onDoubleClick={() => open(item)}
          className={cn(
            'origin-top rounded-[16px] border border-white/50 bg-background/85 p-1 text-foreground',
            'shadow-[0_5px_10px_rgba(0,0,0,0.18)] transition-[scale,box-shadow] duration-200',
            'group-hover:scale-[1.035] group-hover:shadow-[0_8px_14px_rgba(0,0,0,0.26)] active:scale-95',
            'dark:border-white/15',
          )}
        >
          <Content item={item} />
        </div>
        <button
          data-hit
          title="取下"
          onClick={() => (item.type === 'clock' ? window.overlay?.hideClock() : window.overlay?.remove(item.id))}
          className={cn(
            'absolute top-1 left-1 flex size-5 scale-60 items-center justify-center rounded-full border border-white/50',
            'bg-background/90 text-foreground opacity-0 shadow transition duration-150 dark:border-white/15',
            'group-hover:scale-100 group-hover:opacity-100',
          )}
        >
          <X className="size-2.5" strokeWidth={3} />
        </button>
        {copied && (
          <div className="absolute -bottom-4 flex items-center gap-1 rounded-full border border-white/50 bg-background/90 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow animate-in fade-in slide-in-from-top-1 dark:border-white/15">
            <Check className="size-3" /> 已复制
          </div>
        )}
      </div>
    </div>
  )
}
