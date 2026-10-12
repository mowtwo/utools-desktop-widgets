import { useEffect, useState } from 'react'
import { Camera, CircleDot, Clock3, Image, Keyboard, Maximize2, Music, Palette, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Row } from '@/components/row'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ALL_PINGS, DEFAULT_LOL_WHEEL, pingById, soundUrl as lolSoundUrl, textureUrl } from '@/ping/lol/pings'
import {
  CAPTURE_SIZES,
  DEFAULT_WHEEL,
  DURATIONS,
  openSoundUrl,
  previewSound,
  SIGNALS,
  signalById,
  SignalBadge,
  SOUND_PACKS,
  type SoundPack,
} from '@/ping/signals'
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
  const lol = ping.style !== 'open'

  // 从 uTools 快捷键设置回来后刷新显示
  useEffect(() => {
    const refresh = () => setHotKey(services.pingHotKey())
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [services])

  /** 轮盘上第 i 个位置：图标、名字、可选项、试听 */
  const slots = lol
    ? (ping.lolWheel.length === 8 ? ping.lolWheel : [...DEFAULT_LOL_WHEEL]).map((id) => {
        const def = pingById(id)
        return {
          id,
          icon: <img src={textureUrl(def.icon)} className="size-9 object-contain" />,
          preview: () => previewSound(lolSoundUrl(def.sound)),
        }
      })
    : (ping.wheel.length === 8 ? ping.wheel : DEFAULT_WHEEL).map((id) => ({
        id,
        icon: <SignalBadge signal={signalById(id)} size={36} />,
        preview: () => previewSound(openSoundUrl(ping.soundPack, signalById(id))),
      }))
  const options = lol ? ALL_PINGS.map((p) => ({ id: p.id, label: p.name })) : SIGNALS.map((s) => ({ id: s.id, label: s.label }))
  const setSlot = (i: number, id: string) => {
    const ids = slots.map((s, j) => (j === i ? id : s.id))
    services.setPing(lol ? { lolWheel: ids } : { wheel: ids })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 p-5">
      <section className="divide-y rounded-xl border bg-card">
        <Row icon={<Keyboard />} title="快捷键" hint="按下后在光标处弹出信号轮盘；推荐「双击 ⌥ Option」">
          <span className="font-mono text-xs text-muted-foreground">{hotKey ?? '未设置'}</span>
          <Button variant="outline" size="sm" onClick={services.setPingHotKey}>
            设置
          </Button>
        </Row>
        <Row icon={<Palette />} title="风格" hint={lol ? '英雄联盟原版的信号、动画和音效' : '开源素材：game-icons 图标 + Kenney 音效'}>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={ping.style}
            onValueChange={(v) => v && services.setPing({ style: v as PingSettings['style'] })}
          >
            <ToggleGroupItem value="lol">原版</ToggleGroupItem>
            <ToggleGroupItem value="open">开源</ToggleGroupItem>
          </ToggleGroup>
        </Row>
        <Row icon={<Clock3 />} title="停留时长" hint="信号在屏幕上显示多久">
          <Select value={String(ping.duration)} onValueChange={(v) => services.setPing({ duration: Number(v) })}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATIONS.map((d) => (
                <SelectItem key={d.ms} value={String(d.ms)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
        <Row icon={<Camera />} title="截图" hint="发信号时以它为中心截一块屏幕，叠上信号图案">
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
        <Row icon={<Image />} title="图标大小" hint="逻辑像素；原版的 110 是 Windows 100% 缩放下的物理像素，在 Retina 屏上约等于 56">
          <SliderValue min={24} max={128} step={2} value={ping.size || 56} unit="px" onCommit={(size) => services.setPing({ size })} />
        </Row>
        <Row icon={<CircleDot />} title="轮盘大小" hint="按下快捷键后弹出的轮盘">
          <SliderValue
            min={50}
            max={100}
            step={5}
            value={Math.round((ping.wheelScale || 0.7) * 100)}
            unit="%"
            onCommit={(v) => services.setPing({ wheelScale: v / 100 })}
          />
        </Row>
        <Row icon={<Volume2 />} title="提示音" hint="默认关闭；开启后预先加载，播放没有延迟">
          <Switch checked={ping.sound} onCheckedChange={(sound) => services.setPing({ sound })} />
        </Row>
        {!lol && ping.sound && (
          <Row icon={<Music />} title="音效" hint="点下面轮盘上的图标可以试听">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={ping.soundPack}
              onValueChange={(v) => v && services.setPing({ soundPack: v as SoundPack })}
            >
              {(Object.keys(SOUND_PACKS) as SoundPack[]).map((k) => (
                <ToggleGroupItem key={k} value={k}>
                  {SOUND_PACKS[k].label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </Row>
        )}
      </section>

      <section className="rounded-xl border bg-card p-4">
        <div className="mb-3 text-sm font-medium">轮盘</div>
        <div className="grid grid-cols-4 gap-3">
          {slots.map((slot, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <button title="试听" onClick={slot.preview} className="transition hover:scale-110">
                {slot.icon}
              </button>
              <Select value={slot.id} onValueChange={(v) => setSlot(i, v)}>
                <SelectTrigger size="sm" className="h-7 w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-[10px] text-muted-foreground">{SLOT_NAMES[i]}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          {lol ? (
            <>
              轮盘和信号特效移植自 lolPing（MIT）。本插件依据 Riot Games 的「Legal Jibber Jabber」政策使用 Riot Games
              拥有的素材制作，Riot Games 不认可也不赞助本项目。
            </>
          ) : (
            <>图标来自 game-icons.net（Lorc、Delapouite、Carl Olsen，CC BY 3.0），音效来自 Kenney（CC0）。</>
          )}
        </p>
      </section>
    </div>
  )
}

/** 滑块：拖动时只更新显示的数值，松手才保存，免得拖一下写几十次设置 */
function SliderValue(props: { min: number; max: number; step: number; value: number; unit: string; onCommit(v: number): void }) {
  const [draft, setDraft] = useState<number | null>(null)
  const shown = draft ?? props.value
  return (
    <>
      <Slider
        className="w-40"
        min={props.min}
        max={props.max}
        step={props.step}
        value={[shown]}
        onValueChange={([v]) => setDraft(v)}
        onValueCommit={([v]) => {
          setDraft(null)
          props.onCommit(v)
        }}
      />
      <span className="w-12 text-right font-mono text-xs text-muted-foreground">
        {shown}
        {props.unit}
      </span>
    </>
  )
}
