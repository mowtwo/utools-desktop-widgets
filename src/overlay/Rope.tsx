import type { Rope } from './physics'

/** 把绳子画到 canvas 上：中性灰的细绳，带高光和软阴影，两端淡出 */
export function drawRope(canvas: HTMLCanvasElement, rope: Rope) {
  const dpr = window.devicePixelRatio || 1
  const width = rope.width
  const height = canvas.clientHeight
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, width, height)

  const trace = (dy: number) => {
    const { xs, ys } = rope
    ctx.beginPath()
    ctx.moveTo(xs[0], ys[0] + dy)
    // 过各节中点的二次曲线，比折线平滑
    for (let i = 1; i < xs.length - 1; i++) {
      ctx.quadraticCurveTo(xs[i], ys[i] + dy, (xs[i] + xs[i + 1]) / 2, (ys[i] + ys[i + 1]) / 2 + dy)
    }
    ctx.lineTo(xs[xs.length - 1], ys[ys.length - 1] + dy)
  }
  const fade = (r: number, g: number, b: number, a: number) => {
    const grad = ctx.createLinearGradient(0, 0, width, 0)
    grad.addColorStop(0, `rgba(${r},${g},${b},0)`)
    grad.addColorStop(0.08, `rgba(${r},${g},${b},${a})`)
    grad.addColorStop(0.92, `rgba(${r},${g},${b},${a})`)
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`)
    return grad
  }

  ctx.lineCap = 'round'
  ctx.save()
  ctx.filter = 'blur(1.2px)'
  trace(1.2)
  ctx.strokeStyle = fade(0, 0, 0, 0.22)
  ctx.lineWidth = 1.4
  ctx.stroke()
  ctx.restore()

  trace(0)
  ctx.strokeStyle = fade(140, 140, 140, 1)
  ctx.lineWidth = 1.2
  ctx.stroke()

  trace(-0.35)
  ctx.strokeStyle = fade(255, 255, 255, 0.45)
  ctx.lineWidth = 0.4
  ctx.stroke()
}

/** 铝夹子：拉丝金属小药丸，中间一道夹住绳子的缝 */
export function Clothespin({ className }: { className?: string }) {
  return (
    <div
      className={`relative z-10 mx-auto h-[26px] w-[9px] rounded-[3.5px] ${className ?? ''}`}
      style={{
        background: 'linear-gradient(90deg, #b3b3b3 0%, #ededed 35%, #d1d1d1 65%, #9e9e9e 100%)',
        boxShadow: 'inset 0 0.6px 0 rgba(255,255,255,0.9), inset 0 -0.6px 0 rgba(0,0,0,0.18), 0 1.5px 2px rgba(0,0,0,0.3)',
      }}
    >
      <div className="absolute top-[8.5px] left-1/2 h-[1.4px] w-[5px] -translate-x-1/2 rounded-full bg-black/30" />
    </div>
  )
}
