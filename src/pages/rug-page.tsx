import { Cpu, Gauge, Move, Palette, RotateCcw, Shirt } from 'lucide-react'
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

export function RugPage({ rug, editing }: { rug: RugSettings; editing: boolean }) {
  const services = window.services!
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <section className="divide-y rounded-xl border bg-card">
        <Row icon={<Shirt />} title="桌面地毯" hint="铺在桌面图标上、应用窗口下面，乱糟糟的图标往下一藏；文件不会被移动">
          <Switch checked={rug.enabled} onCheckedChange={(enabled) => services.setRug({ enabled })} />
        </Row>
        <Row
          icon={<Move />}
          title="摆放地毯"
          hint="平时地毯不接收鼠标，点击都落到桌面；进入编辑模式后才能拖动、缩放、旋转"
        >
          <Button size="sm" disabled={!rug.enabled || editing} onClick={services.editRug}>
            {editing ? '编辑中…' : '编辑地毯'}
          </Button>
        </Row>
        <Row icon={<Palette />} title="花样" hint="编辑模式的工具栏里也能切换">
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
        点「编辑地毯」（也可以用 uTools 指令「编辑地毯」），地毯会浮到最上层，屏幕上方出现工具栏：拖动地毯盖住图标；抓住边或角往上拖可以掀开；把一个角拉过去可以对折；点「调整大小
        / 旋转」后拖角可以缩放和旋转。点「完成」保存位置，地毯回到桌面图标上、所有窗口下面，平时点击都直接落到桌面。
        <div className="mt-2">
          移植自 desktop-rug（MIT，Joseph Zhou），地毯的创意和视觉设计来自 Terkel；使用了 three.js（MIT）和 Paper
          Shaders（Apache-2.0）。
        </div>
      </section>
    </div>
  )
}
