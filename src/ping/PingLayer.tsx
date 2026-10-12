import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { PingSettings, Rect } from '@/types/line'
import { DEFAULT_WHEEL, ICON_SIZES, playPingSound, signalById, SignalBadge, type Signal } from './signals'

/** 轮盘半径、中心取消区半径（px） */
const RADIUS = 82
const DEAD_ZONE = 26
/** 轮盘打开后多久没操作自动关闭（ms） */
const WHEEL_TIMEOUT = 8000
/** 信号在屏幕上停留多久（ms） */
const PING_MS = 2400

interface Props {
  settings: PingSettings
  bounds: Rect
}

interface Ping {
  key: number
  x: number
  y: number
  signal: Signal
}

/** 把徽章渲染成 SVG 字符串，用来叠到截图上 */
function badgeSvg(signal: Signal, size: number) {
  const host = document.createElement('div')
  const root = createRoot(host)
  flushSync(() => root.render(<SignalBadge signal={signal} size={size} />))
  const svg = host.innerHTML
  root.unmount()
  return svg
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

/**
 * 信号：快捷键在光标处弹出轮盘，按方向选一个信号点一下；
 * 设置了截图就先截下以光标为中心的一块、叠上信号图标，再在屏幕上播放信号动画
 */
export function PingLayer({ settings, bounds }: Props) {
  const [wheel, setWheel] = useState<{ x: number; y: number } | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  const [pings, setPings] = useState<Ping[]>([])
  const seq = useRef(0)
  const settingsRef = useRef(settings)
  const boundsRef = useRef(bounds)

  useEffect(() => {
    settingsRef.current = settings
    boundsRef.current = bounds
  })

  useEffect(() => {
    window.overlay?.onPingOpen((p) => {
      const b = boundsRef.current
      setWheel({ x: p.x - b.x, y: p.y - b.y })
      setPointer(null)
    })
  }, [])

  // 太久没操作就收起轮盘
  useEffect(() => {
    if (!wheel) return
    const timer = setTimeout(() => setWheel(null), WHEEL_TIMEOUT)
    return () => clearTimeout(timer)
  }, [wheel])

  const ids = settings.wheel.length === 8 ? settings.wheel : DEFAULT_WHEEL
  const slots = ids.map(signalById)

  /** 光标相对轮盘中心的方向 → 第几个扇区（正上方是 0，顺时针） */
  const hovered = (() => {
    if (!wheel || !pointer) return null
    const dx = pointer.x - wheel.x
    const dy = pointer.y - wheel.y
    if (Math.hypot(dx, dy) < DEAD_ZONE) return null
    const angle = (Math.atan2(dx, -dy) * 180) / Math.PI
    return Math.round(((angle + 360) % 360) / 45) % 8
  })()

  const fire = async (at: { x: number; y: number }, signal: Signal) => {
    setWheel(null)
    const s = settingsRef.current
    const b = boundsRef.current
    if (s.output !== 'none') {
      // 等轮盘从屏幕上消失再截，截图里不能有轮盘
      await nextFrame()
      await nextFrame()
      try {
        await captureAndSend(at, signal, s, b)
      } catch (e) {
        window.overlay?.log('ping-failed', String((e as Error)?.message ?? e))
      }
    }
    const key = ++seq.current
    setPings((list) => [...list, { key, x: at.x, y: at.y, signal }])
    if (s.sound) playPingSound(signal)
    setTimeout(() => setPings((list) => list.filter((p) => p.key !== key)), PING_MS)
  }

  return (
    <>
      {wheel && (
        // 轮盘打开时整个窗口接收鼠标（data-hit），点中心或右键取消
        <div
          data-hit
          className="fixed inset-0 cursor-crosshair"
          onMouseMove={(e) => setPointer({ x: e.clientX, y: e.clientY })}
          onClick={() => (hovered === null ? setWheel(null) : void fire(wheel, slots[hovered]))}
          onContextMenu={(e) => {
            e.preventDefault()
            setWheel(null)
          }}
        >
          <div
            className="pointer-events-none absolute animate-in fade-in zoom-in-75 duration-150"
            style={{ left: wheel.x, top: wheel.y }}
          >
            <div
              className="absolute -translate-1/2 rounded-full bg-black/45 shadow-2xl backdrop-blur-sm"
              style={{ width: RADIUS * 2 + 56, height: RADIUS * 2 + 56 }}
            />
            <div className="absolute size-3 -translate-1/2 rounded-full border-2 border-white/80 bg-white/20" />
            {slots.map((signal, i) => {
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
              {hovered === null ? '移向一个信号再点击，点中心或右键取消' : slots[hovered].label}
            </div>
          </div>
        </div>
      )}

      {pings.map((p) => (
        <PingMark key={p.key} ping={p} size={ICON_SIZES[settings.icon]} />
      ))}
    </>
  )
}

/** 屏幕上的信号：徽章弹出、两圈波纹扩散，然后淡出 */
function PingMark({ ping, size }: { ping: Ping; size: number }) {
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
      <div className="absolute -translate-1/2" style={{ animation: `ping-pop ${PING_MS}ms ease-out both` }}>
        <SignalBadge signal={ping.signal} size={size} />
      </div>
      <div
        // 居中用 transform：动画会改 translate 属性，不能和 Tailwind 的 translate 类混用
        className="absolute rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white shadow"
        style={{
          top: size / 2 + 8,
          transform: 'translateX(-50%)',
          background: ping.signal.color,
          animation: `ping-fade ${PING_MS}ms ease-out both`,
        }}
      >
        {ping.signal.label}
      </div>
    </div>
  )
}

/** 截下以信号为中心的一块，叠上信号徽章，交给主界面按设置复制或挂起来 */
async function captureAndSend(at: { x: number; y: number }, signal: Signal, s: PingSettings, b: Rect) {
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

  const size = ICON_SIZES[s.icon] * shot.scale
  const cx = (at.x - left) * shot.scale
  const cy = (at.y - top) * shot.scale
  // 一圈淡淡的光晕，让图标在任何背景上都显眼
  ctx.beginPath()
  ctx.arc(cx, cy, size * 0.85, 0, Math.PI * 2)
  ctx.fillStyle = `${signal.color}33`
  ctx.fill()
  const badge = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(badgeSvg(signal, ICON_SIZES[s.icon]))}`)
  ctx.drawImage(badge, cx - size / 2, cy - size / 2, size, size)

  window.overlay!.pingResult(canvas.toDataURL('image/png'))
}
