import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { PingSettings, Rect } from '@/types/line'
import { spawnPing } from './lol/fx'
import { ALL_PINGS, DEFAULT_LOL_WHEEL, pingById, soundUrl as lolSoundUrl, textureUrl, TICK_SOUND, type PingDef } from './lol/pings'
import { SoundBank } from './lol/soundBank'
import { Wheel } from './lol/wheel'
import { DEFAULT_WHEEL, SIGNALS, signalById, SignalBadge, SOUND_PACKS, type Signal } from './signals'
import './lol/lol.css'

/** 开源风格的信号（MCP 用的语义 id）→ 原版风格里意思最接近的信号 */
const LOL_OF_SIGNAL: Record<string, string> = {
  alert: 'generic',
  danger: 'danger',
  coming: 'omw',
  help: 'assist',
  look: 'needvision',
  question: 'missing',
  done: 'visioncleared',
  idea: 'generic',
  ok: 'omw',
  wait: 'danger',
  go: 'allin',
  hot: 'danger',
  target: 'push',
}

/** 开源风格轮盘的半径、中心取消区半径（px） */
const RADIUS = 82
const DEAD_ZONE = 26
/** 轮盘打开后多久没操作自动关闭（ms） */
const WHEEL_TIMEOUT = 8000

interface Props {
  settings: PingSettings
  bounds: Rect
  /** 在小把手位置弹出一条提示 */
  onToast(text: string): void
}

/** 截图里怎么画这个信号 */
type Drawer = (ctx: CanvasRenderingContext2D, cx: number, cy: number, scale: number) => Promise<void>

const OUTPUT_TOAST: Record<PingSettings['output'], string> = {
  copy: '信号截图已复制',
  hang: '信号截图已挂到晾衣绳',
  both: '信号截图已复制，并挂到晾衣绳',
  none: '',
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)))

/** 把开源风格的徽章渲染成 SVG 字符串，用来叠到截图上 */
function badgeSvg(signal: Signal, size: number) {
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(<SignalBadge signal={signal} size={size} />))
  const svg = host.innerHTML
  root.unmount()
  return svg
}

/** 原版风格截图里的信号：地面光晕 + 图案（和屏幕上 lolPing 的样式一致） */
function lolDrawer(def: PingDef, sizeDip: number): Drawer {
  return async (ctx, cx, cy, scale) => {
    const size = sizeDip * scale
    const gy = cy + size * 0.32
    const ground = ctx.createRadialGradient(cx, gy, 0, cx, gy, size * 0.42)
    ground.addColorStop(0, `${def.color}cc`)
    ground.addColorStop(1, `${def.color}00`)
    ctx.save()
    // 地面光晕是压扁的椭圆
    ctx.translate(cx, gy)
    ctx.scale(1, 0.29)
    ctx.translate(-cx, -gy)
    ctx.fillStyle = ground
    ctx.beginPath()
    ctx.arc(cx, gy, size * 0.42, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    const images = await Promise.all(def.art.map((a) => loadImage(textureUrl(a))))
    ctx.save()
    ctx.shadowColor = def.color
    ctx.shadowBlur = 10 * scale
    for (const img of images) ctx.drawImage(img, cx - size / 2, cy - size * 0.73, size, size)
    ctx.restore()
  }
}

function openDrawer(signal: Signal, sizeDip: number): Drawer {
  return async (ctx, cx, cy, scale) => {
    const size = sizeDip * scale
    ctx.beginPath()
    ctx.arc(cx, cy, size * 0.85, 0, Math.PI * 2)
    ctx.fillStyle = `${signal.color}33`
    ctx.fill()
    const badge = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(signal, sizeDip))}`)
    ctx.drawImage(badge, cx - size / 2, cy - size / 2, size, size)
  }
}

/**
 * 信号：快捷键在光标处弹出轮盘，按方向选一个信号点一下；
 * 设置了截图就先截下以光标为中心的一块、叠上信号图案，再在屏幕上播放信号动画。
 * 原版风格的轮盘、特效、音效库移植自 lolPing（MIT），素材按 Riot 的同人政策使用
 */
export function PingLayer({ settings, bounds, onToast }: Props) {
  const [wheelAt, setWheelAt] = useState<{ x: number; y: number } | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [openPings, setOpenPings] = useState<{ key: number; x: number; y: number; signal: Signal }[]>([])
  const seq = useRef(0)
  const settingsRef = useRef(settings)
  const boundsRef = useRef(bounds)
  const toastRef = useRef(onToast)
  const svgRef = useRef<SVGSVGElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const lolWheel = useRef<Wheel | null>(null)
  const bank = useRef<{ key: string; bank: SoundBank } | null>(null)
  const lol = settings.style !== 'open'

  useEffect(() => {
    settingsRef.current = settings
    boundsRef.current = bounds
    toastRef.current = onToast
  })

  /** 提示音：开了才加载，按风格 / 音效包预先解码 */
  const sounds = useMemo(() => {
    if (!settings.sound) return null
    if (lol) {
      const names = [...new Set([...ALL_PINGS.map((p) => p.sound), TICK_SOUND])]
      return { key: 'lol', entries: names.map((s) => ({ key: s, url: lolSoundUrl(s) })) }
    }
    const pack = SOUND_PACKS[settings.soundPack] ?? SOUND_PACKS.digital
    return {
      key: `open-${settings.soundPack}`,
      entries: SIGNALS.map((s) => ({ key: s.id, url: `sounds/${settings.soundPack}/${pack.files[s.id]}.${pack.ext}` })),
    }
  }, [settings.sound, settings.soundPack, lol])

  useEffect(() => {
    if (!sounds || bank.current?.key === sounds.key) return
    const b = new SoundBank()
    void b.load(sounds.entries)
    bank.current = { key: sounds.key, bank: b }
  }, [sounds])

  const play = (key: string) => {
    if (settingsRef.current.sound) bank.current?.bank.play(key, 0.7)
  }

  // 原版风格的轮盘是 lolPing 的 SVG 类，命令式地画在 svg 里
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!lol || !svg) return
    lolWheel.current = new Wheel(svg, '信号', textureUrl('generic_ping'), () => play(TICK_SOUND))
    return () => {
      lolWheel.current = null
      svg.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lol])

  useEffect(() => {
    lolWheel.current?.setScale(settings.wheelScale || 0.7)
  }, [settings.wheelScale, lol])

  useEffect(() => {
    const ids = settings.lolWheel.length === 8 ? settings.lolWheel : DEFAULT_LOL_WHEEL
    lolWheel.current?.setItems(ids.map((id) => ({ key: id, icon: textureUrl(pingById(id).icon) })))
  }, [settings.lolWheel, lol])

  useEffect(() => {
    window.overlay?.onPingOpen((p) => {
      const b = boundsRef.current
      const at = { x: p.x - b.x, y: p.y - b.y }
      setWheelAt(at)
      setPointer(null)
      lolWheel.current?.open(at.x, at.y)
    })
  }, [])

  // 太久没操作就收起轮盘
  useEffect(() => {
    if (!wheelAt) return
    const timer = setTimeout(() => {
      setWheelAt(null)
      lolWheel.current?.cancel()
    }, WHEEL_TIMEOUT)
    return () => clearTimeout(timer)
  }, [wheelAt])

  const close = () => {
    setWheelAt(null)
    lolWheel.current?.cancel()
  }

  const wheelScale = settings.wheelScale || 0.7
  const openIds = settings.wheel.length === 8 ? settings.wheel : DEFAULT_WHEEL
  const openSlots = openIds.map(signalById)

  /** 开源风格：光标相对轮盘中心的方向 → 第几个扇区（正上方是 0，顺时针） */
  const hovered = (() => {
    if (lol || !wheelAt || !pointer) return null
    const dx = pointer.x - wheelAt.x
    const dy = pointer.y - wheelAt.y
    if (Math.hypot(dx, dy) < DEAD_ZONE * wheelScale) return null
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    return Math.round(((angle + 360) % 360) / 45) % 8
  })()

  /** capture=false：AI Agent 直接发的信号，只播放动画，不截图 */
  const fire = async (at: { x: number; y: number }, show: () => void, draw: Drawer, capture = true) => {
    setWheelAt(null)
    const s = settingsRef.current
    if (capture && s.output !== 'none') {
      // 等轮盘从屏幕上消失再截，截图里不能有轮盘
      await nextFrame()
      await nextFrame()
      try {
        await captureAndSend(at, draw, s, boundsRef.current)
        toastRef.current(OUTPUT_TOAST[s.output])
      } catch (e) {
        window.overlay?.log('ping-failed', String((e as Error)?.message ?? e))
        toastRef.current('信号截图失败')
      }
    }
    show()
  }

  const fireLol = (id: string, at: { x: number; y: number }, capture = true) => {
    const def = pingById(id)
    const size = settingsRef.current.size || 56
    void fire(
      at,
      () => {
        if (layerRef.current) spawnPing(layerRef.current, def, at.x, at.y, { sizePx: size, durationS: settingsRef.current.duration / 1000 })
        play(def.sound)
      },
      lolDrawer(def, size),
      capture,
    )
  }

  const fireOpen = (signal: Signal, at: { x: number; y: number }, capture = true) => {
    void fire(
      at,
      () => {
        const key = ++seq.current
        setOpenPings((list) => [...list, { key, x: at.x, y: at.y, signal }])
        play(signal.id)
        setTimeout(() => setOpenPings((list) => list.filter((p) => p.key !== key)), settingsRef.current.duration)
      },
      openDrawer(signal, settingsRef.current.size || 56),
      capture,
    )
  }

  // AI Agent 直接发信号：按当前风格播放，原版风格换成语义最接近的信号
  const fireRef = useRef({ fireLol, fireOpen })
  useEffect(() => {
    fireRef.current = { fireLol, fireOpen }
  })
  useEffect(() => {
    window.overlay?.onPingFire(({ x, y, signal }) => {
      const b = boundsRef.current
      const at = { x: x - b.x, y: y - b.y }
      if (settingsRef.current.style !== 'open') fireRef.current.fireLol(LOL_OF_SIGNAL[signal] ?? 'generic', at, false)
      else fireRef.current.fireOpen(signalById(signal), at, false)
    })
  }, [])

  const onClick = (e: React.MouseEvent) => {
    if (!wheelAt) return
    if (lol) {
      const picked = lolWheel.current?.release(e.clientX, e.clientY)
      if (picked) fireLol(picked.key, wheelAt)
      else close()
    } else if (hovered === null) close()
    else fireOpen(openSlots[hovered], wheelAt)
  }

  return (
    <div className="lol">
      {wheelAt && (
        // 轮盘打开时整个窗口接收鼠标（data-hit），点中心或右键取消
        <div
          data-hit
          className="fixed inset-0 cursor-crosshair"
          onMouseMove={(e) => {
            setPointer({ x: e.clientX, y: e.clientY })
            lolWheel.current?.move(e.clientX, e.clientY)
          }}
          onClick={onClick}
          onContextMenu={(e) => {
            e.preventDefault()
            close()
          }}
        />
      )}
      {/* 原版风格：lolPing 的轮盘（不接收鼠标，鼠标由上面的遮罩处理） */}
      {lol && <svg ref={svgRef} id="ping-wheel" className="wheel" viewBox="-300 -300 600 600" />}

      {!lol && wheelAt && (
        <div
          className="pointer-events-none absolute animate-in fade-in zoom-in-75 duration-150"
          style={{ left: wheelAt.x, top: wheelAt.y, scale: wheelScale }}
        >
          <div
            className="absolute -translate-1/2 rounded-full bg-black/45 shadow-2xl backdrop-blur-sm"
            style={{ width: RADIUS * 2 + 56, height: RADIUS * 2 + 56 }}
          />
          <div className="absolute size-3 -translate-1/2 rounded-full border-2 border-white/80 bg-white/20" />
          {openSlots.map((signal, i) => {
            const rad = (i * 45 * Math.PI) / 180
            const active = hovered === i
            return (
              <div
                key={i}
                className="absolute -translate-1/2 transition-transform duration-100"
                style={{
                  left: Math.sin(rad) * RADIUS,
                  top: -Math.cos(rad) * RADIUS,
                  scale: active ? 1.25 : 0.9,
                  opacity: hovered === null || active ? 1 : 0.55,
                }}
              >
                <SignalBadge signal={signal} size={40} />
              </div>
            )
          })}
          <div className="absolute top-[118px] -translate-x-1/2 rounded-full bg-black/60 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-white">
            {hovered === null ? '移向一个信号再点击，点中心或右键取消' : openSlots[hovered].label}
          </div>
        </div>
      )}

      {/* 原版风格的信号由 lolPing 的 spawnPing 画在这一层 */}
      <div ref={layerRef} className="pointer-events-none fixed inset-0" />
      {openPings.map((p) => (
        <OpenPingMark key={p.key} ping={p} size={settings.size || 56} duration={settings.duration} />
      ))}
    </div>
  )
}

/** 开源风格的信号：徽章弹出、两圈波纹扩散，然后淡出 */
function OpenPingMark({ ping, size, duration }: { ping: { x: number; y: number; signal: Signal }; size: number; duration: number }) {
  return (
    <div className="pointer-events-none absolute" style={{ left: ping.x, top: ping.y }}>
      {[0, 1].map((i) => (
        <div
          key={i}
          className="absolute -translate-1/2 rounded-full border-[3px]"
          style={{
            width: size,
            height: size,
            borderColor: ping.signal.color,
            animation: `ping-ripple 1.2s ease-out ${i * 0.35}s 2 both`,
          }}
        />
      ))}
      <div className="absolute -translate-1/2" style={{ animation: `ping-pop ${duration}ms ease-out both` }}>
        <SignalBadge signal={ping.signal} size={size} />
      </div>
      <div
        // 居中用 transform：动画会改 translate 属性，不能和 Tailwind 的 translate 类混用
        className="absolute rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white shadow"
        style={{
          top: size / 2 + 8,
          transform: 'translateX(-50%)',
          background: ping.signal.color,
          animation: `ping-fade ${duration}ms ease-out both`,
        }}
      >
        {ping.signal.label}
      </div>
    </div>
  )
}

/** 截下以信号为中心的一块，画上信号，交给主界面按设置复制或挂起来 */
async function captureAndSend(at: { x: number; y: number }, draw: Drawer, s: PingSettings, b: Rect) {
  // 截图框以信号为中心，碰到屏幕边就往里挪
  const w = Math.min(s.width, b.width)
  const h = Math.min(s.height, b.height)
  const left = Math.min(Math.max(0, at.x - w / 2), b.width - w)
  const top = Math.min(Math.max(0, at.y - h / 2), b.height - h)
  const shot = await window.overlay!.pingCapture({ x: b.x + left, y: b.y + top, width: w, height: h })
  if (!shot.dataUrl || !shot.scale) throw new Error(shot.error ?? '截图失败')

  const img = await loadImage(shot.dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)
  await draw(ctx, (at.x - left) * shot.scale, (at.y - top) * shot.scale, shot.scale)
  window.overlay!.pingResult(canvas.toDataURL('image/png'))
}
