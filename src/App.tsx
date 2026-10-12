import { useState } from 'react'
import { Bug, Camera, Clock, FolderOpen, Layers, Monitor, PanelTopOpen, Shirt, StickyNote, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useLine } from '@/lib/use-line'
import { isContent, type ContentItem, type DisplayInfo, type LineMode } from '@/types/line'

const PRIMARY = 'primary'
const MAX_CHOICES = [6, 8, 12, 20]

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

function ItemRow({ item }: { item: ContentItem }) {
  const services = window.services!
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      {item.type === 'image' && <img src={item.src} className="size-9 rounded-md border object-cover" />}
      {item.type === 'file' &&
        (item.src ? (
          <img src={item.src} className="size-9 rounded-md border object-cover" />
        ) : (
          <img src={item.icon} className="size-9 object-contain" />
        ))}
      {item.type === 'note' && (
        <span className="flex size-9 items-center justify-center rounded-md border bg-muted">
          <StickyNote className="size-4 text-muted-foreground" />
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-sm">
        {item.type === 'image' ? '截图' : item.type === 'note' ? item.text : item.name}
      </span>
      <Button variant="ghost" size="icon-sm" title="取下" onClick={() => services.removeItem(item.id)}>
        <X />
      </Button>
    </div>
  )
}

export default function App() {
  const line = useLine()
  const services = window.services
  const [displays, setDisplays] = useState<DisplayInfo[]>(() => services?.listDisplays() ?? [])
  const [note, setNote] = useState('')

  if (!services) {
    return <div className="p-6 text-sm text-muted-foreground">请在 uTools 中打开</div>
  }

  const content = line.items.filter(isContent)
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
    services.addNote(note)
    setNote('')
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <section className="divide-y rounded-xl border bg-card">
        <Row icon={<Shirt />} title="晾衣绳" hint="挂在屏幕顶部，除了挂着的东西都能点穿">
          <Switch checked={line.enabled} onCheckedChange={services.setEnabled} />
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
        <Row icon={<Clock />} title="时钟" hint="也是一件挂在绳上的东西，可以拖动">
          <Switch checked={line.clock} onCheckedChange={services.setClock} />
        </Row>
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
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="写张便签挂上去" />
          <Button type="submit" disabled={!note.trim()}>
            挂上去
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          也可以在 uTools 里粘贴图片、选中文字或文件后选「挂到晾衣绳」；或者点绳子空白处加个夹子，再往夹子上挂东西
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
              disabled={!line.items.some((it) => it.type !== 'clock')}
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
