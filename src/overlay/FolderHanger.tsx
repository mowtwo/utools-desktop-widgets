import { useState } from 'react'
import { ChevronDown, FolderOpen } from 'lucide-react'
import type { FileItem, FolderEntry } from '@/types/line'
import { cn } from '@/lib/utils'
import { CARD_WIDTH } from './layout'
import { glass } from './styles'

/** 衣架最多展开几项 */
const FOLDER_LIMIT = 8

interface Props {
  item: FileItem
  open: boolean
  setOpen(open: boolean): void
  /** 开始把文件拖到别处（别的应用，或拖回绳子上挂起来） */
  onDragOut(): void
}

/**
 * 文件夹挂成折叠衣架：点一下展开最近修改的几项，每项可以单击打开、拖到别的应用或拖到绳子上挂起来；
 * 最后一行用访达 / 资源管理器打开整个文件夹
 */
export function FolderHanger({ item, open, setOpen, onDragOut }: Props) {
  const o = window.overlay!
  const [listing, setListing] = useState<{ total: number; entries: FolderEntry[]; error?: string } | null>(null)


  const dragStart = (e: React.DragEvent, path: string) => {
    // 取消网页拖拽，只保留系统文件拖拽，否则对方收到的是空文件
    e.preventDefault()
    onDragOut()
    o.startDrag(path)
  }

  const more = listing ? listing.total - listing.entries.length : 0
  const manager = navigator.userAgent.includes('Mac') ? '访达' : '资源管理器'

  return (
    <div className="flex flex-col items-center">
      <div
        data-hit
        draggable
        title="点一下展开，拖出去发送整个文件夹"
        onDragStart={(e) => dragStart(e, item.path)}
        onClick={() => {
          // 每次展开都重新读一遍，文件夹内容可能变了
          if (!open) setListing(o.listFolder(item.path, FOLDER_LIMIT))
          setOpen(!open)
        }}
        onDoubleClick={() => void o.openPath(item.path)}
        className={cn(
          'flex flex-col items-center gap-1 rounded-[16px] px-2 pt-2 pb-1.5 shadow-[0_5px_10px_rgba(0,0,0,0.18)]',
          'transition-[scale] duration-200 hover:scale-[1.035]',
          glass,
        )}
        style={{ width: CARD_WIDTH - 14 }}
      >
        <img src={item.icon} draggable={false} className="size-11 object-contain" />
        <div className="flex w-full items-center justify-center gap-0.5">
          <span className="truncate text-xs font-medium">{item.name}</span>
          <ChevronDown className={cn('size-3 shrink-0 text-muted-foreground transition', open && 'rotate-180')} />
        </div>
      </div>

      {open && listing && (
        <div
          data-hit
          className={cn('mt-1.5 flex w-52 flex-col rounded-xl p-1 shadow-lg animate-in fade-in slide-in-from-top-1', glass)}
        >
          {listing.error && <div className="px-2 py-1.5 text-xs text-destructive">读不了这个文件夹</div>}
          {!listing.error && listing.entries.length === 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">空文件夹</div>
          )}
          {listing.entries.map((entry) => (
            <div
              key={entry.path}
              draggable
              title="单击打开，拖到别的应用或绳子上"
              onDragStart={(e) => dragStart(e, entry.path)}
              onClick={() => void o.openPath(entry.path)}
              className="flex cursor-default items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted"
            >
              <img
                src={entry.src ?? entry.icon}
                draggable={false}
                className={cn('size-5 shrink-0', entry.src ? 'rounded-sm object-cover' : 'object-contain')}
              />
              <span className="truncate text-xs">{entry.name}</span>
            </div>
          ))}
          {more > 0 && <div className="px-2 pt-0.5 pb-1 text-[11px] text-muted-foreground">还有 {more} 项</div>}
          <button
            onClick={() => void o.openPath(item.path)}
            className="mt-0.5 flex items-center gap-2 rounded-lg border-t px-2 py-1.5 text-left text-xs hover:bg-muted"
          >
            <FolderOpen className="size-3.5" />在{manager}中打开
          </button>
        </div>
      )}
    </div>
  )
}
