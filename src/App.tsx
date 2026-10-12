import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Activity, Bug, Focus, HeartPulse, Sparkle, Camera, FolderOpen, GripHorizontal, Layers, ListTodo, Monitor, PanelTopOpen, Shirt, StickyNote, Timer, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FOCUS_TODO_EVENT } from '@/lib/enter'
import { useLine } from '@/lib/use-line'
import { cn } from '@/lib/utils'
import {
  isContent,
  TODO_MAX,
  type ContentItem,
  type DisplayInfo,
  type HandlePosition,
  type LineMode,
  type LineState,
  type TodoItem,
} from '@/types/line'

// 代码编辑器（CodeMirror）比较大，打开「挂件扩展」时才加载
const ExtensionsPage = lazy(() => import('@/extensions-page').then((m) => ({ default: m.ExtensionsPage })))

const PRIMARY = 'primary'
const MAX_CHOICES = [6, 8, 12, 20]
const HIDE_DELAYS = [
  { ms: 300, label: '0.3 秒' },
  { ms: 800, label: '0.8 秒' },
  { ms: 1500, label: '1.5 秒' },
  { ms: 3000, label: '3 秒' },
  { ms: 5000, label: '5 秒' },
]

function displayName(d: DisplayInfo, index: number) {
  const name = d.label || `屏幕 ${index + 1}`
  return `${name} · ${d.width}×${d.height}${d.primary ? ' · 主屏' : ''}`
}

function Row({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          {hint && <div className="truncate text-xs text-muted-foreground">{hint}</div>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

function ItemRow({ item }: { item: ContentItem | TodoItem }) {
  const services = window.services!
  const path = item.type === 'note' || item.type === 'todo' ? null : item.path
  return (
    <div
      className={cn('flex items-center gap-3 px-4 py-2', path && 'cursor-grab')}
      draggable={!!path}
      title={path ? '拖到别的应用里发送' : undefined}
      onDragStart={(e) => {
        // 取消网页自己的拖拽，只保留 startDrag 发起的系统文件拖拽，否则对方收到的是空文件
        e.preventDefault()
        if (path) window.utools?.startDrag(path)
      }}
    >
      {item.type === 'image' && <img src={item.src} className="size-9 rounded-md border object-cover" />}
      {item.type === 'file' &&
        (item.src ? (
          <img src={item.src} className="size-9 rounded-md border object-cover" />
        ) : (
          <img src={item.icon} className="size-9 object-contain" />
        ))}
      {(item.type === 'note' || item.type === 'todo') && (
        <span className="flex size-9 items-center justify-center rounded-md border bg-muted">
          {item.type === 'todo' ? (
            <ListTodo className="size-4 text-muted-foreground" />
          ) : (
            <StickyNote className="size-4 text-muted-foreground" />
          )}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">
        {item.type === 'image' ? '截图' : item.type === 'file' ? item.name : item.text}
      </span>
      <Button variant="ghost" size="icon-sm" title="取下" onClick={() => services.removeItem(item.id)}>
        <X />
      </Button>
    </div>
  )
}

export default function App() {
  const line = useLine()
  const [tab, setTab] = useState('line')
  const dark = useDark()

  // 「快速便签」指令进来：切到晾衣绳页，聚焦待办输入框（由 LinePage 处理）
  useEffect(() => {
    const onFocusTodo = () => setTab('line')
    window.addEventListener(FOCUS_TODO_EVENT, onFocusTodo)
    return () => window.removeEventListener(FOCUS_TODO_EVENT, onFocusTodo)
  }, [])

  if (!window.services) {
    return <div className="p-6 text-sm text-muted-foreground">请在 uTools 中打开</div>
  }

  return (
    <Tabs value={tab} onValueChange={setTab} className="flex h-screen flex-col gap-0">
      <div className="flex justify-center border-b px-5 py-2">
        <TabsList>
          <TabsTrigger value="line">晾衣绳</TabsTrigger>
          <TabsTrigger value="extensions">挂件扩展</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="line" className="min-h-0 flex-1 overflow-auto">
        <LinePage line={line} />
      </TabsContent>
      <TabsContent value="extensions" className="min-h-0 flex-1 p-4">
        <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">加载编辑器…</div>}>
          <ExtensionsPage key={line.extensions.length ? 'ready' : 'empty'} extensions={line.extensions} extErrors={line.extErrors} dark={dark} />
        </Suspense>
      </TabsContent>
    </Tabs>
  )
}

/** 跟随 html 上的 dark class（由 applyTheme 设置） */
function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const observer = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return dark
}

function LinePage({ line }: { line: LineState }) {
  const services = window.services!
  const [displays, setDisplays] = useState<DisplayInfo[]>(() => services.listDisplays())
  const [note, setNote] = useState('')
  const [kind, setKind] = useState<'note' | 'todo'>('note')
  const noteInput = useRef<HTMLInputElement>(null)
  const [keepAlive, setKeepAlive] = useState(() => services.hasKeepAlive())

  useEffect(() => {
    const onFocusTodo = () => {
      setKind('todo')
      setTimeout(() => noteInput.current?.focus(), 50)
    }
    window.addEventListener(FOCUS_TODO_EVENT, onFocusTodo)
    return () => window.removeEventListener(FOCUS_TODO_EVENT, onFocusTodo)
  }, [])

  const content = line.items.filter((it): it is ContentItem | TodoItem => isContent(it) || it.type === 'todo')
  const missing = line.displayId != null && !displays.some((d) => d.id === line.displayId)

  const capture = async () => {
    window.utools?.hideMainWindow()
    try {
      services.addImageData(await window.utools!.screenCapture())
    } catch {
      // 用户取消截图
    }
  }

  const pickFiles = () => {
    const paths = window.utools?.showOpenDialog({ title: '挂到晾衣绳', properties: ['openFile', 'multiSelections'] })
    if (paths?.length) services.addFiles(paths)
  }

  const submitNote = () => {
    if (kind === 'todo') services.addTodo(note)
    else services.addNote(note)
    setNote('')
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <section className="divide-y rounded-xl border bg-card">
        <Row icon={<Shirt />} title="晾衣绳" hint="挂在屏幕顶部，除了挂着的东西都能点穿">
          <Switch checked={line.enabled} onCheckedChange={services.setEnabled} />
        </Row>
        <Row
          icon={<HeartPulse />}
          title="保持显示"
          hint="uTools 会把后台的插件结束，晾衣绳随之消失；开启后每分钟检查一次，被结束就自动恢复"
        >
          <Switch
            checked={keepAlive}
            onCheckedChange={async (on) => {
              if (on) setKeepAlive(await services.requestKeepAlive())
              else {
                services.removeKeepAlive()
                setKeepAlive(false)
              }
            }}
          />
        </Row>
        <Row
          icon={<Monitor />}
          title="显示在"
          hint={line.displayFallback ? '选中的屏幕没有连接，暂时显示在主屏' : undefined}
        >
          <Select
            value={line.displayId == null ? PRIMARY : String(line.displayId)}
            onOpenChange={(open) => open && setDisplays(services.listDisplays())}
            onValueChange={(v) => services.setDisplay(v === PRIMARY ? null : Number(v))}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PRIMARY}>跟随主屏</SelectItem>
              {displays.map((d, i) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {displayName(d, i)}
                </SelectItem>
              ))}
              {missing && (
                <SelectItem value={String(line.displayId)} disabled>
                  之前选的屏幕（未连接）
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </Row>
        <Row icon={<PanelTopOpen />} title="显示方式" hint={line.mode === 'auto' ? '鼠标顶到屏幕上边缘时滑下来' : '一直挂着'}>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={line.mode}
            onValueChange={(v) => v && services.setMode(v as LineMode)}
          >
            <ToggleGroupItem value="auto">自动隐藏</ToggleGroupItem>
            <ToggleGroupItem value="pinned">常驻</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        {line.mode === 'auto' && (
          <Row
            icon={<GripHorizontal />}
            title="把手位置"
            hint={
              line.notch
                ? '检测到刘海屏：默认放右边，碰顶触发也会避开刘海'
                : '收起后屏幕顶部的小把手，碰一下就拉下来'
            }
          >
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={line.handle ?? 'auto'}
              onValueChange={(v) => v && services.setHandle(v === 'auto' ? null : (v as HandlePosition))}
            >
              <ToggleGroupItem value="auto">自动</ToggleGroupItem>
              <ToggleGroupItem value="left">左</ToggleGroupItem>
              <ToggleGroupItem value="center">中</ToggleGroupItem>
              <ToggleGroupItem value="right">右</ToggleGroupItem>
            </ToggleGroup>
          </Row>
        )}
        {line.mode === 'auto' && (
          <Row icon={<Timer />} title="收起延迟" hint="鼠标离开晾衣绳多久后收起">
            <Select value={String(line.hideDelay)} onValueChange={(v) => services.setHideDelay(Number(v))}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HIDE_DELAYS.map((d) => (
                  <SelectItem key={d.ms} value={String(d.ms)}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        )}
        <Row icon={<Layers />} title="最多挂几件" hint="超出后最旧的会掉下去">
          <Select value={String(line.maxItems)} onValueChange={(v) => services.setMaxItems(Number(v))}>
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAX_CHOICES.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row
          icon={<Sparkle />}
          title="渲染保活"
          hint="右下角放一个看不见的 1 像素点持续小幅重绘，修复拉下后晾衣绳不显示"
        >
          <Switch checked={line.renderAnchor} onCheckedChange={services.setRenderAnchor} />
        </Row>
        {line.mode === 'auto' && (
          <Row
            icon={<Focus />}
            title="滑出时获取焦点（试验）"
            hint="拉下来却看不到晾衣绳时试试：动画更可靠，但会抢走当前窗口的键盘焦点"
          >
            <Switch checked={line.focusOnReveal} onCheckedChange={services.setFocusOnReveal} />
          </Row>
        )}
        {window.utools?.isDev() && (
          <Row icon={<Activity />} title="诊断面板" hint="仅开发模式：悬浮层右下角显示可见性和动画帧数">
            <Switch checked={line.debugHud} onCheckedChange={services.setDebugHud} />
          </Row>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
        <div className="flex gap-2">
          <Button variant="outline" onClick={capture}>
            <Camera /> 截图挂上去
          </Button>
          <Button variant="outline" onClick={pickFiles}>
            <FolderOpen /> 挂文件
          </Button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            submitNote()
          }}
        >
          <ToggleGroup
            type="single"
            variant="outline"
            value={kind}
            onValueChange={(v) => v && setKind(v as 'note' | 'todo')}
          >
            <ToggleGroupItem value="note" title="便签：单击复制">
              <StickyNote />
            </ToggleGroupItem>
            <ToggleGroupItem value="todo" title="待办：点完成就自动销毁">
              <ListTodo />
            </ToggleGroupItem>
          </ToggleGroup>
          <Input
            ref={noteInput}
            value={note}
            maxLength={kind === 'todo' ? TODO_MAX : undefined}
            onChange={(e) => setNote(e.target.value)}
            placeholder={kind === 'todo' ? `写条待办（最多 ${TODO_MAX} 字），完成后自动销毁` : '写张便签挂上去'}
          />
          <Button type="submit" disabled={!note.trim()}>
            挂上去
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          也可以在 uTools 里粘贴图片、选中文字或文件后选「挂到晾衣绳」（文件夹会挂成可展开的衣架）；或者点绳子空白处加个夹子，再往夹子上挂东西
        </p>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            挂着的 <Badge variant="secondary">{content.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            {window.utools?.isDev() && (
              <Button variant="ghost" size="icon-sm" title="调试悬浮层" onClick={services.openOverlayDevTools}>
                <Bug />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              title="全部取下"
              disabled={!line.items.some((it) => it.type !== 'widget')}
              onClick={services.clearItems}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
        {content.length > 0 && (
          <div className="divide-y border-t">
            {content.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
