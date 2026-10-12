import { useEffect, useState } from 'react'
import { Camera, Image, Keyboard, Maximize2, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Row } from '@/components/row'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CAPTURE_SIZES, DEFAULT_WHEEL, playPingSound, SIGNALS, signalById, SignalBadge } from '@/ping/signals'
import type { PingSettings } from '@/types/line'

const OUTPUTS: { value: PingSettings['output']; label: string }[] = [
  { value: 'copy', label: '复制到剪贴板' },
  { value: 'hang', label: '挂到晾衣绳' },
  { value: 'both', label: '复制并挂上' },
  { value: 'none', label: '不截图' },
]

/** 轮盘位置的名字：从正上方开始顺时针 */
const SLOT_NAMES = ['上', '右上', '右', '右下', '下', '左下', '左', '左上']

export function PingPage({ ping }: { ping: PingSettings }) {
  const services = window.services!
  const [hotKey, setHotKey] = useState(() => services.pingHotKey())
  const wheel = ping.wheel.length === 8 ? ping.wheel : DEFAULT_WHEEL

  // 从 uTools 快捷键设置回来后刷新显示
  useEffect(() => {
    const refresh = () => setHotKey(services.pingHotKey())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [services])

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <section className="divide-y rounded-xl border bg-card">
        <Row icon={<Keyboard />} title="快捷键" hint="按下后在光标处弹出信号轮盘；推荐设成「双击 ⌥ Option」">
          <span className="font-mono text-xs text-muted-foreground">{hotKey ?? '未设置'}</span>
          <Button variant="outline" size="sm" onClick={services.setPingHotKey}>
            设置
          </Button>
        </Row>
        <Row icon={<Camera />} title="截图" hint="发信号时以它为中心截一块屏幕，叠上信号图标">
          <Select value={ping.output} onValueChange={(v) => services.setPing({ output: v as PingSettings['output'] })}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {OUTPUTS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        {ping.output !== 'none' && (
          <Row icon={<Maximize2 />} title="截图尺寸">
            <Select
              value={`${ping.width}x${ping.height}`}
              onValueChange={(v) => {
                const [width, height] = v.split('x').map(Number)
                services.setPing({ width, height })
              }}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTURE_SIZES.map((s) => (
                  <SelectItem key={`${s.w}x${s.h}`} value={`${s.w}x${s.h}`}>
                    {s.w} × {s.h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        )}
        <Row icon={<Image />} title="图标大小" hint="屏幕上的信号和截图里叠加的图标">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={ping.icon}
            onValueChange={(v) => v && services.setPing({ icon: v as PingSettings['icon'] })}
          >
            <ToggleGroupItem value="sm">小</ToggleGroupItem>
            <ToggleGroupItem value="md">中</ToggleGroupItem>
            <ToggleGroupItem value="lg">大</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row icon={<Volume2 />} title="提示音" hint="默认关闭；音效来自 Kenney Interface Sounds（CC0）">
          <Switch checked={ping.sound} onCheckedChange={(sound) => services.setPing({ sound })} />
        </Row>
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 text-sm font-medium">轮盘</div>
        <div className="grid grid-cols-4 gap-3">
          {wheel.map((id, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <button
                title="试听"
                onClick={() => playPingSound(signalById(id))}
                className="transition hover:scale-110"
              >
                <SignalBadge signal={signalById(id)} size={36} />
              </button>
              <Select
                value={id}
                onValueChange={(v) => services.setPing({ wheel: wheel.map((w, j) => (j === i ? v : w)) })}
              >
                <SelectTrigger size="sm" className="h-7 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SIGNALS.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">{SLOT_NAMES[i]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          信号交互参考了 lolPing（MIT）。图标和配色都是重新做的，没有使用游戏里的素材。
        </p>
      </section>
    </div>
  )
}
