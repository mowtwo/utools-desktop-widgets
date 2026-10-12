import { useState } from 'react'
import { Blocks, Camera, ClipboardPaste, FolderOpen, FolderTree, ListTodo, Plus, Trash2 } from 'lucide-react'
import { TODO_MAX } from '@/types/line'
import type { WidgetExtension } from '@/widget/protocol'
import { cn } from '@/lib/utils'
import { glass } from './styles'

interface Props {
  id: string
  menuOpen: boolean
  setMenuOpen(open: boolean): void
  extensions: WidgetExtension[]
}

/** 空夹子：点一下选要挂什么（文件、粘贴、截图、待办、挂件），也可以直接把文件拖到它上面 */
export function EmptyClip({ id, menuOpen, setMenuOpen, extensions }: Props) {
  const o = window.overlay!
  const [view, setView] = useState<'menu' | 'todo' | 'widgets'>('menu')
  const [text, setText] = useState('')

  const close = () => {
    setMenuOpen(false)
    setView('menu')
    setText('')
  }
  const pick = (source: Parameters<typeof o.fillClip>[1]) => {
    close()
    o.fillClip(id, source)
  }
  const submitTodo = () => {
    if (text.trim()) o.addTodo(text, id)
    close()
  }

  const actions = [
    { icon: <FolderOpen />, label: '选文件', run: () => pick('files') },
    { icon: <FolderTree />, label: '挂文件夹', run: () => pick('folder') },
    { icon: <ClipboardPaste />, label: '粘贴', run: () => pick('paste') },
    { icon: <Camera />, label: '截图', run: () => pick('capture') },
    {
      icon: <ListTodo />,
      label: '待办',
      run: () => {
        // 要在悬浮层里打字，得先拿到键盘焦点
        o.focus()
        setView('todo')
      },
    },
    { icon: <Blocks />, label: '挂件…', run: () => setView('widgets') },
    { icon: <Trash2 />, label: '取下夹子', run: () => o.remove(id) },
  ]

  return (
    <div className="relative -mt-1 flex flex-col items-center" data-clip={id}>
      <button
        data-hit
        title="往夹子上挂东西"
        onClick={() => (menuOpen ? close() : setMenuOpen(true))}
        className={cn(
          'flex size-7 items-center justify-center rounded-full border border-dashed border-foreground/30',
          'bg-background/70 text-muted-foreground shadow-sm transition hover:scale-110 hover:text-foreground',
        )}
      >
        <Plus className="size-3.5" />
      </button>
      {menuOpen && (
        <div data-hit className={cn('mt-1.5 flex flex-col rounded-xl p-1 shadow-lg animate-in fade-in zoom-in-95', glass)}>
          {view === 'menu' &&
            actions.map((a) => (
              <MenuButton key={a.label} icon={a.icon} label={a.label} onClick={a.run} />
            ))}
          {view === 'widgets' &&
            (extensions.length ? (
              extensions.map((ext) => (
                <MenuButton key={ext.id} icon={<Blocks />} label={ext.name} onClick={() => pick(`widget:${ext.id}`)} />
              ))
            ) : (
              <div className="px-2.5 py-1.5 text-xs text-muted-foreground">还没有挂件扩展</div>
            ))}
          {view === 'todo' && (
            <form
              className="flex w-44 flex-col gap-1 p-1"
              onSubmit={(e) => {
                e.preventDefault()
                submitTodo()
              }}
            >
              <input
                autoFocus
                value={text}
                maxLength={TODO_MAX}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && close()}
                placeholder="要做什么？"
                className="rounded-md border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>回车挂上去</span>
                <span>
                  {Array.from(text).length}/{TODO_MAX}
                </span>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  )
}

export function MenuButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick(): void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs whitespace-nowrap hover:bg-muted [&_svg]:size-3.5 [&_svg]:shrink-0"
    >
      {icon}
      <span className="max-w-36 truncate">{label}</span>
    </button>
  )
}
