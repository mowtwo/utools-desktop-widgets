import { Clock, Layers, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useStore } from '@/store'

export default function App() {
  const overlayEnabled = useStore((s) => s.overlayEnabled)
  const widgets = useStore((s) => s.widgets)
  const setOverlayEnabled = useStore((s) => s.setOverlayEnabled)
  const updateWidget = useStore((s) => s.updateWidget)
  const resetWidget = useStore((s) => s.resetWidget)

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-muted">
            <Layers className="size-5" />
          </div>
          <div>
            <Label htmlFor="overlay" className="text-base font-medium">
              桌面悬浮层
            </Label>
            <p className="text-sm text-muted-foreground">置顶显示在所有屏幕上，挂件以外的区域点击穿透</p>
          </div>
        </div>
        <Switch id="overlay" checked={overlayEnabled} onCheckedChange={setOverlayEnabled} />
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">挂件</h2>
        {widgets.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
            <div className="flex items-center gap-3">
              <Clock className="size-5 text-muted-foreground" />
              <span className="font-medium">时钟</span>
              <Badge variant="secondary">
                {Math.round(w.x)}, {Math.round(w.y)}
              </Badge>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id={`${w.id}-seconds`}
                  checked={w.showSeconds}
                  onCheckedChange={(showSeconds) => updateWidget(w.id, { showSeconds })}
                />
                <Label htmlFor={`${w.id}-seconds`}>显示秒</Label>
              </div>
              <Button variant="ghost" size="icon" title="恢复默认位置" onClick={() => resetWidget(w.id)}>
                <RotateCcw />
              </Button>
              <Switch checked={w.enabled} onCheckedChange={(enabled) => updateWidget(w.id, { enabled })} />
            </div>
          </div>
        ))}
      </section>
    </div>
  )
}
