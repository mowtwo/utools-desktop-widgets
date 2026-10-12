import { Cpu, Gauge, Palette, RotateCcw, Shirt } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Row } from '@/components/row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { RugSettings } from '@/types/line'

/** 与 desktop-rug 的 MATERIAL_IDS 对应 */
const MATERIALS = [
  { id: 'persian', label: '波斯纹样' },
  { id: 'warp', label: '流纹' },
  { id: 'grain', label: '颗粒渐变' },
  { id: 'mesh', label: '柔和渐变' },
  { id: 'dots', label: '圆点' },
]

export function RugPage({ rug }: { rug: RugSettings }) {
  const services = window.services!
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <section className="divide-y rounded-xl border bg-card">
        <Row icon={<Shirt />} title="桌面地毯" hint="铺在桌面图标上、应用窗口下面，乱糟糟的图标往下一藏；文件不会被移动">
          <Switch checked={rug.enabled} onCheckedChange={(enabled) => services.setRug({ enabled })} />
        </Row>
        <Row icon={<Palette />} title="花样" hint="也可以按住 ⌥ Option 点地毯下方的「花样」切换">
          <Select value={rug.material} onValueChange={(material) => services.setRug({ material })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MATERIALS.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row icon={<Gauge />} title="渲染等级" hint="像素密度、阴影质量；电脑发热或卡顿时调低">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={rug.quality}
            onValueChange={(v) => v && services.setRug({ quality: v as RugSettings['quality'] })}
          >
            <ToggleGroupItem value="high">高</ToggleGroupItem>
            <ToggleGroupItem value="medium">中</ToggleGroupItem>
            <ToggleGroupItem value="low">低</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row icon={<Cpu />} title="拖拽精度" hint="拖动、掀开、对折时布料模拟的细致程度；静止时不耗电">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={rug.precision}
            onValueChange={(v) => v && services.setRug({ precision: v as RugSettings['precision'] })}
          >
            <ToggleGroupItem value="fine">精细</ToggleGroupItem>
            <ToggleGroupItem value="standard">标准</ToggleGroupItem>
            <ToggleGroupItem value="eco">省电</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row icon={<RotateCcw />} title="放回中间" hint="地毯找不到或者揉乱了时用">
          <Button variant="outline" size="sm" disabled={!rug.enabled} onClick={services.resetRug}>
            复位
          </Button>
        </Row>
      </section>

      <section className="rounded-xl border bg-card p-4 text-xs leading-relaxed text-muted-foreground">
        <div className="mb-1 text-sm font-medium text-foreground">怎么用</div>
        拖动地毯盖住图标；抓住边或角往上拖可以掀开；把一个角拉过去可以对折；抓住中间往一边拉可以叠起；双击摊平；按住 ⌥
        Option 拖角可以缩放和旋转。地毯以外的地方，点击直接落到桌面上。
        <div className="mt-2">
          移植自 desktop-rug（MIT，Joseph Zhou），地毯的创意和视觉设计来自 Terkel；使用了 three.js（MIT）和 Paper
          Shaders（Apache-2.0）。
        </div>
      </section>
    </div>
  )
}
