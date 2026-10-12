import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, Puzzle, X } from 'lucide-react'
import type { LineItem } from '@/types/line'
import type { WidgetExtension } from '@/widget/runtime'
import { WidgetFrame, type WidgetHost } from '@/widget/WidgetFrame'
import { cn } from '@/lib/utils'
import { EmptyClip } from './EmptyClip'
import { FolderHanger } from './FolderHanger'
import { CARD_WIDTH, PHOTO_MAX_HEIGHT } from './layout'
import { Clothespin } from './Rope'
import { glass } from './styles'
import { TodoCard } from './TodoCard'

const URL_RE = /^https?:\/\/\S+$/i
const INNER = CARD_WIDTH - 14

interface Props {
  item: LineItem
  /** 挂件实例对应的扩展；扩展被删了就是 undefined */
  extension?: WidgetExtension
  extensions: WidgetExtension[]
  /** 主题变化时变化，通知挂件沙箱 */
  themeKey: unknown
  /** 把根元素交给物理循环，由它每帧写 translate / rotate */
  bind(id: string, el: HTMLDivElement | null): void
  /** 按住夹子：开始沿绳子拖动；没拖动就松开算点击 */
  onPinDown(e: ReactPointerEvent, id: string, onClick: () => void): void
  /** 碰一下，让它晃 */
  kick(id: string, amount: number): void
  /** 开始把文件拖到别的应用：拖拽结束前由外层按光标位置决定是否点击穿透 */
  onDragOut(): void
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

/** 图片、便签、文件：一张卡片里显示的内容 */
function CardContent({ item }: { item: Extract<LineItem, { type: 'image' | 'note' | 'file' }> }) {
  switch (item.type) {
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

/** 挂件扩展的一个实例：在沙箱里跑，api 的请求在这里转给悬浮层 preload */
function WidgetCard({ id, extension, data, themeKey }: { id: string; extension?: WidgetExtension; data?: Record<string, unknown>; themeKey: unknown }) {
  const [error, setError] = useState<string | null>(null)
  const host = useMemo<WidgetHost>(() => {
    const o = window.overlay!
    return {
      copy: (text) => o.copyText(text),
      open: (url) => void o.openExternal(url),
      notify: (text) => o.notify(text),
      saveData: (d) => o.saveWidgetData(id, d),
      onError: (message, line) => setError(line ? `第 ${line} 行：${message}` : message),
    }
  }, [id])

  if (!extension) {
    return (
      <div className={cn('flex flex-col items-center gap-1 rounded-[16px] px-3 py-3 text-xs text-muted-foreground', glass)}>
        <Puzzle className="size-4" />
        扩展已被删除
      </div>
    )
  }
  return (
    <div data-hit className={cn('relative rounded-[16px] p-1 shadow-[0_5px_10px_rgba(0,0,0,0.18)]', glass)}>
      <WidgetFrame ext={extension} data={data} host={host} themeKey={themeKey} />
      {error && (
        <div
          title={error}
          className="absolute right-1.5 bottom-1.5 size-2 rounded-full bg-destructive shadow"
          aria-label="挂件脚本出错"
        />
      )}
    </div>
  )
}

/** 夹在绳子上的一件东西：拖夹子换位置；单击复制，双击打开，拖卡片发到别的应用 */
export function Pegged({ item, extension, extensions, themeKey, bind, onPinDown, kick, onDragOut }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const isFolder = item.type === 'file' && !!item.isDirectory
  const draggable = (item.type === 'image' || item.type === 'file') && !isFolder

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

  // 点菜单 / 展开的衣架以外的地方就收起来
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [menuOpen])

  /** 待办完成：晃一下，从夹子上掉下去，再真正取下 */
  const fallAndRemove = () => {
    kick(item.id, 4)
    bodyRef.current?.animate(
      [
        { translate: '0 0', rotate: '0deg', opacity: 1 },
        { translate: '0 260px', rotate: '18deg', opacity: 0 },
      ],
      { duration: 620, easing: 'cubic-bezier(.55,0,.85,.4)', fill: 'forwards' },
    )
    // 不等动画的 finish 事件：页面被判定为不可见时动画不推进，finish 永远不会来
    setTimeout(() => window.overlay?.remove(item.id), 650)
  }

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
          <EmptyClip id={item.id} menuOpen={menuOpen} setMenuOpen={setMenuOpen} extensions={extensions} />
        ) : (
          <div className="group relative -mt-3.5 flex justify-center">
            {item.type === 'widget' ? (
              <WidgetCard id={item.id} extension={extension} data={item.data} themeKey={themeKey} />
            ) : item.type === 'todo' ? (
              <TodoCard item={item} onDone={fallAndRemove} />
            ) : isFolder ? (
              <FolderHanger item={item as Extract<LineItem, { type: 'file' }>} open={menuOpen} setOpen={setMenuOpen} onDragOut={onDragOut} />
            ) : (
              <div
                data-hit
                draggable={draggable}
                onDragStart={(e) => {
                  // 必须取消网页自己的 HTML5 拖拽：否则拖出去的是一个没有文件数据的元素，
                  // 微信 / QQ 会把它当成空文件。取消后只保留 startDrag 发起的系统文件拖拽
                  e.preventDefault()
                  if (!draggable) return
                  onDragOut()
                  window.overlay?.startDrag((item as Extract<LineItem, { type: 'image' | 'file' }>).path)
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
                <CardContent item={item} />
              </div>
            )}
            <button
              data-hit
              title="取下"
              onClick={() => window.overlay?.remove(item.id)}
              className={cn(
                'absolute top-1 left-1 z-10 flex size-5 scale-60 items-center justify-center rounded-full opacity-0 shadow',
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
