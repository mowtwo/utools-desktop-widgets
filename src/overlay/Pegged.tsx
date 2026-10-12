import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Camera, Check, ClipboardPaste, FolderOpen, Plus, Trash2, X } from 'lucide-react'
import type { LineItem } from '@/types/line'
import { cn } from '@/lib/utils'
import { CARD_WIDTH, PHOTO_MAX_HEIGHT } from './layout'
import { Clothespin } from './Rope'

const URL_RE = /^https?:\/\/\S+$/i
const INNER = CARD_WIDTH - 14

const glass = 'border border-white/50 bg-background/85 text-foreground dark:border-white/15'

interface Props {
  item: LineItem
  /** 把根元素交给物理循环，由它每帧写 translate / rotate */
  bind(id: string, el: HTMLDivElement | null): void
  /** 按住夹子：开始沿绳子拖动；没拖动就松开算点击 */
  onPinDown(e: ReactPointerEvent, id: string, onClick: () => void): void
  /** 碰一下，让它晃 */
  kick(id: string, amount: number): void
  /** 开始把文件拖到别的应用：拖拽结束前不能收起绳子、不能切回点击穿透 */
  onDragOut(): void
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

function Content({ item }: { item: Exclude<LineItem, { type: 'clip' }> }) {
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

function copy(item: LineItem) {
  const o = window.overlay!
  switch (item.type) {
    case 'image':
      return o.copyImage(item.path)
    case 'file':
      return item.src ? o.copyImage(item.path) : o.copyFile(item.path)
    case 'note':
      return o.copyText(item.text)
    default:
      return false
  }
}

function open(item: LineItem) {
  const o = window.overlay!
  if (item.type === 'image' || item.type === 'file') void o.openPath(item.path)
  else if (item.type === 'note' && URL_RE.test(item.text)) void o.openExternal(item.text)
}

/** 空夹子：点一下选要挂什么，也可以直接把文件拖到它上面 */
function EmptyClip({ id, menuOpen, setMenuOpen }: { id: string; menuOpen: boolean; setMenuOpen(open: boolean): void }) {
  const o = window.overlay!
  const pick = (source: 'files' | 'paste' | 'capture') => {
    setMenuOpen(false)
    o.fillClip(id, source)
  }
  const actions = [
    { icon: <FolderOpen />, label: '选文件', run: () => pick('files') },
    { icon: <ClipboardPaste />, label: '粘贴', run: () => pick('paste') },
    { icon: <Camera />, label: '截图', run: () => pick('capture') },
    { icon: <Trash2 />, label: '取下夹子', run: () => o.remove(id) },
  ]
  return (
    <div className="relative -mt-1 flex flex-col items-center" data-clip={id}>
      <button
        data-hit
        title="往夹子上挂东西"
        onClick={() => setMenuOpen(!menuOpen)}
        className={cn(
          'flex size-7 items-center justify-center rounded-full border border-dashed border-foreground/30',
          'bg-background/70 text-muted-foreground shadow-sm transition hover:scale-110 hover:text-foreground',
        )}
      >
        <Plus className="size-3.5" />
      </button>
      {menuOpen && (
        <div
          data-hit
          className={cn('mt-1.5 flex flex-col rounded-xl p-1 shadow-lg animate-in fade-in zoom-in-95', glass)}
        >
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.run}
              className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs whitespace-nowrap hover:bg-muted [&_svg]:size-3.5"
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 夹在绳子上的一件东西：拖夹子换位置；单击复制，双击打开，拖卡片发到别的应用 */
export function Pegged({ item, bind, onPinDown, kick, onDragOut }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const draggable = item.type === 'image' || item.type === 'file'

  useLayoutEffect(() => {
    bind(item.id, rootRef.current)
    // 挂上去：从上方落下来
    bodyRef.current?.animate([{ translate: '0 -40px', opacity: 0 }, { translate: '0 0', opacity: 1 }], {
      duration: 420,
      easing: 'cubic-bezier(.34,1.4,.64,1)',
    })
    return () => bind(item.id, null)
  }, [bind, item.id])

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(timer)
  }, [copied])

  // 点空夹子菜单以外的地方就收起菜单
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  return (
    <div
      ref={rootRef}
      // 外层不接收鼠标，只有 data-hit 的部分接收：否则相邻挂件的透明外框会盖住彼此的夹子和按钮
      className="pointer-events-none absolute top-0 left-0 [&_[data-hit]]:pointer-events-auto"
      style={{ width: CARD_WIDTH, transformOrigin: `${CARD_WIDTH / 2}px 0` }}
    >
      {/* 夹子是拖动手柄，热区比夹子本身大一圈 */}
      <div
        data-hit
        title="拖动换位置"
        className="relative z-10 mx-auto w-7 cursor-grab touch-none py-0.5 active:cursor-grabbing"
        onPointerDown={(e) =>
          onPinDown(e, item.id, () => (item.type === 'clip' ? setMenuOpen(!menuOpen) : kick(item.id, 2)))
        }
      >
        <Clothespin />
      </div>
      <div ref={bodyRef}>
        {item.type === 'clip' ? (
          <EmptyClip id={item.id} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
        ) : (
          <div className="group relative -mt-3.5 flex justify-center">
            <div
              data-hit
              draggable={draggable}
              onDragStart={(e) => {
                // 必须取消网页自己的 HTML5 拖拽：否则拖出去的是一个没有文件数据的元素，
                // 微信 / QQ 会把它当成空文件。取消后只保留 startDrag 发起的系统文件拖拽
                e.preventDefault()
                if (!draggable) return
                onDragOut()
                window.overlay?.startDrag(item.path)
              }}
              onClick={() => {
                if (copy(item)) setCopied(true)
                kick(item.id, 2.5)
              }}
              onDoubleClick={() => open(item)}
              className={cn(
                'origin-top rounded-[16px] p-1 shadow-[0_5px_10px_rgba(0,0,0,0.18)] transition-[scale,box-shadow] duration-200',
                'group-hover:scale-[1.035] group-hover:shadow-[0_8px_14px_rgba(0,0,0,0.26)] active:scale-95',
                glass,
              )}
            >
              <Content item={item} />
            </div>
            <button
              data-hit
              title="取下"
              onClick={() => window.overlay?.remove(item.id)}
              className={cn(
                'absolute top-1 left-1 flex size-5 scale-60 items-center justify-center rounded-full opacity-0 shadow',
                'transition duration-150 group-hover:scale-100 group-hover:opacity-100',
                glass,
              )}
            >
              <X className="size-2.5" strokeWidth={3} />
            </button>
            {copied && (
              <div
                className={cn(
                  'absolute -bottom-4 flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow',
                  'animate-in fade-in slide-in-from-top-1',
                  glass,
                )}
              >
                <Check className="size-3" /> 已复制
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
