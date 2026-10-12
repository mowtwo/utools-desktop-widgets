import { ROPE_TOP, sag } from './layout'

/** 一根细的中性灰绳子，两端淡出，像是从屏幕外面拉过来的 */
export function Rope({ width }: { width: number }) {
  const s = sag(width)
  const d = `M -20 ${ROPE_TOP} Q ${width / 2} ${ROPE_TOP + 2 * s} ${width + 20} ${ROPE_TOP}`
  return (
    <svg className="pointer-events-none absolute top-0 left-0" width={width} height={ROPE_TOP + s * 2 + 8}>
      <defs>
        <linearGradient id="rope-fade" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="white" stopOpacity="0" />
          <stop offset="0.08" stopColor="white" />
          <stop offset="0.92" stopColor="white" />
          <stop offset="1" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id="rope-mask">
          <rect width={width} height="100%" fill="url(#rope-fade)" />
        </mask>
        <filter id="rope-shadow" x="-1%" y="-50%" width="102%" height="200%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      <g mask="url(#rope-mask)" fill="none">
        <path d={d} stroke="rgba(0,0,0,0.22)" strokeWidth="1.4" transform="translate(0 1.2)" filter="url(#rope-shadow)" />
        <path d={d} stroke="rgb(140,140,140)" strokeWidth="1.2" />
        <path d={d} stroke="rgba(255,255,255,0.45)" strokeWidth="0.4" transform="translate(0 -0.35)" />
      </g>
    </svg>
  )
}

/** 铝夹子：拉丝金属小药丸，中间一道夹住绳子的缝 */
export function Clothespin() {
  return (
    <div
      className="relative z-10 mx-auto h-[26px] w-[9px] rounded-[3.5px] shadow-[0_1.5px_2px_rgba(0,0,0,0.3)]"
      style={{
        background: 'linear-gradient(90deg, #b3b3b3 0%, #ededed 35%, #d1d1d1 65%, #9e9e9e 100%)',
        boxShadow: 'inset 0 0.6px 0 rgba(255,255,255,0.9), inset 0 -0.6px 0 rgba(0,0,0,0.18), 0 1.5px 2px rgba(0,0,0,0.3)',
      }}
    >
      <div className="absolute top-[8.5px] left-1/2 h-[1.4px] w-[5px] -translate-x-1/2 rounded-full bg-black/30" />
    </div>
  )
}
