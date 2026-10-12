import { useEffect, useRef, useState } from 'react'
import type { OverlayPayload } from '@/types/line'
import { applyTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { CARD_WIDTH, PANEL_HEIGHT, PIN_ABOVE, itemX, ropeY } from './layout'
import { Pegged, type Hangable } from './Pegged'
import { Rope } from './Rope'

/** 鼠标在屏幕最上边缘停留多久后滑出 */
const REVEAL_DWELL_MS = 250
/** 鼠标离开晾衣绳多久后收起 */
const HIDE_DELAY_MS = 350
/** 新挂上东西时自动滑出展示的时长 */
const PEEK_MS = 2500

export default function Overlay() {
  const [payload, setPayload] = useState<OverlayPayload | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [gust, setGust] = useState(0)
  const interactive = useRef(false)
  const revealedRef = useRef(false)
  const peekUntil = useRef(0)

  const setInteractive = (next: boolean) => {
    if (interactive.current === next) return
    interactive.current = next
    window.overlay?.setInteractive(next)
  }

  const reveal = (next: boolean) => {
    if (revealedRef.current === next) return
    revealedRef.current = next
    setRevealed(next)
    // 滑下来时吹一阵风，让东西晃一晃；收起时恢复点击穿透
    if (next) setGust((g) => g + 1)
    else setInteractive(false)
  }

  useEffect(() => {
    window.overlay?.onState((p) => {
      applyTheme(window.overlay?.isDarkColors())
      setPayload(p)
    })
    window.overlay?.onPeek(() => {
      peekUntil.current = Date.now() + PEEK_MS
      reveal(true)
    })
    window.overlay?.ready()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pinned = payload?.mode === 'pinned'
  const shown = pinned || revealed

  // 自动隐藏：鼠标顶到屏幕上边缘就滑出，离开晾衣绳就收起
  useEffect(() => {
    if (!payload || pinned) return
    const { bounds, topInset } = payload
    let edgeSince = 0
    let awaySince = 0
    return window.overlay?.watchCursor((p) => {
      const now = Date.now()
      const inside = p.x >= bounds.x && p.x < bounds.x + bounds.width && p.y >= bounds.y && p.y < bounds.y + bounds.height
      if (!revealedRef.current) {
        awaySince = 0
        if (inside && p.y <= bounds.y + 1) {
          edgeSince ||= now
          if (now - edgeSince >= REVEAL_DWELL_MS) reveal(true)
        } else {
          edgeSince = 0
        }
        return
      }
      edgeSince = 0
      const away = !inside || p.y > bounds.y + topInset + PANEL_HEIGHT + 30
      if (away && now >= peekUntil.current) {
        awaySince ||= now
        if (now - awaySince >= HIDE_DELAY_MS) reveal(false)
      } else {
        awaySince = 0
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, pinned])

  // 常驻模式切换进来时也吹一阵风
  useEffect(() => {
    if (pinned) setGust((g) => g + 1)
  }, [pinned])

  // 整窗默认点击穿透，forward 模式下仍收到 mousemove：鼠标在挂件上就关闭穿透
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)
      setInteractive(shown && !!el?.closest('[data-hit]'))
    }
    const onLeave = () => setInteractive(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [shown])

  if (!payload) return null
  const width = payload.bounds.width
  // 时钟在最左边，其余从旧到新往右排
  const hangables: Hangable[] = [
    ...(payload.clock ? [{ id: 'clock', type: 'clock' } as const] : []),
    ...[...payload.items].reverse(),
  ]

  return (
    <div
      className={cn(
        'absolute left-0 w-full transition-[translate]',
        shown ? 'duration-[420ms] ease-[cubic-bezier(.34,1.25,.64,1)]' : 'duration-[220ms] ease-in',
      )}
      style={{
        top: payload.topInset,
        height: PANEL_HEIGHT,
        // 收起时整根绳子藏到屏幕上边缘外面，像自动隐藏的 Dock
        translate: `0 ${shown ? 0 : -(PANEL_HEIGHT + payload.topInset + 12)}px`,
      }}
    >
      <Rope width={width} />
      {hangables.length === 0 && (
        <div className="absolute top-[34px] left-1/2 -translate-x-1/2 rounded-full border border-white/50 bg-background/85 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow dark:border-white/15">
          截图，或在 uTools 里选「挂到晾衣绳」，东西就会挂在这里
        </div>
      )}
      {hangables.map((item, i) => {
        const x = itemX(i, hangables.length, width)
        return (
          <div
            key={item.id}
            className="absolute transition-[left,top] duration-500 ease-[cubic-bezier(.34,1.2,.64,1)]"
            style={{
              left: x - CARD_WIDTH / 2,
              top: ropeY(x, width) - PIN_ABOVE,
              // 靠近屏幕边缘的淡出
              opacity: Math.min(1, Math.max(0, Math.min(x, width - x) / 90)),
            }}
          >
            <Pegged item={item} gust={gust} />
          </div>
        )
      })}
    </div>
  )
}
