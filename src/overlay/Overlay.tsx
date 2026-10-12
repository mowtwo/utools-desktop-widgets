import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { LineItem, OverlayPayload } from '@/types/line'
import type { HandleContent, LineOp } from '@/widget/runtime'
import { applyTheme } from '@/lib/theme'
import { CARD_WIDTH, PANEL_HEIGHT, PIN_ABOVE, tiltOf } from './layout'
import { Pegged } from './Pegged'
import { Pendulum, Rope, type Load } from './physics'
import { drawRope } from './Rope'

/** 鼠标在屏幕最上边缘停留多久后滑出 */
const REVEAL_DWELL_MS = 250
/** 光标轮询间隔：展开、拖拽中或靠近屏幕顶部时要灵敏，其余时候放慢（ms） */
const POLL_FAST = 60
const POLL_IDLE = 150
/** 光标离屏幕顶部多近算「靠近」（px） */
const NEAR_TOP = 80
/** 拖文件出去时，光标停住多久算拖拽结束 */
const DRAG_OUT_STILL_MS = 1200
/** 拖文件出去最多保持展开多久 */
const DRAG_OUT_MAX_MS = 15000
/** 新挂上东西时自动滑出展示的时长 */
const PEEK_MS = 2500
/** 离绳子多近算点在绳子上（px） */
const ROPE_HIT = 10
/** 夹子手柄比夹子顶端多出的上边距 */
const HANDLE_PAD = 2
/** 夹子能放的范围（占绳长的比例） */
const X_MIN = 0.04
const X_MAX = 0.96
/** 刘海屏上碰顶触发要避开的中间区域半宽（px）：刘海约 200pt 宽，两边再留些余量 */
const NOTCH_HALF = 130
/** 小把手的水平位置（占屏幕宽度的比例） */
const HANDLE_X = { left: 0.25, center: 0.5, right: 0.75 }

/** 每种东西压在绳子上的分量（相对一个绳节） */
const WEIGHT: Record<LineItem['type'], number> = { image: 10, file: 10, note: 7, widget: 8, todo: 4, clip: 2 }

/** 帧统计：排查「拉下来了但没画出来」——动画帧回调和定时器各跑了几次 */
const frameStats = { raf: 0, timer: 0 }

/**
 * 安排下一帧：同时挂动画帧回调和定时器，谁先到谁执行，另一个作废。
 * 悬浮层不在前台时 Chromium 可能停掉动画帧回调（页面仍报告 visible），
 * 靠定时器也能把状态推进到终点
 */
function schedule(cb: (time: number) => void) {
  let done = false
  const run = (via: 'raf' | 'timer') => {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    clearTimeout(timer)
    frameStats[via]++
    cb(performance.now())
  }
  const raf = requestAnimationFrame(() => run('raf'))
  const timer = window.setTimeout(() => run('timer'), 34)
  return () => {
    done = true
    cancelAnimationFrame(raf)
    clearTimeout(timer)
  }
}

export default function Overlay() {
  const [payload, setPayload] = useState<OverlayPayload | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [dark, setDark] = useState(false)
  /** 正在专注的挂件：其他东西都藏起来 */
  const [focusOwner, setFocusOwner] = useState<string | null>(null)
  /** 小把手上的内容和占用它的挂件 */
  const [handleContent, setHandleContent] = useState<(HandleContent & { owner: string }) | null>(null)
  /** 要求晾衣绳保持展开的挂件 */
  const keepOpen = useRef(new Set<string>())
  const interactive = useRef(false)
  const revealedRef = useRef(false)
  const peekUntil = useRef(0)

  // 物理循环用到的可变状态，不走 React 渲染
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rope = useRef<Rope | null>(null)
  const items = useRef<LineItem[]>([])
  const elements = useRef(new Map<string, HTMLDivElement>())
  const pendulums = useRef(new Map<string, Pendulum>())
  /** 拖动中、或刚松手还没等到新状态时的位置（px） */
  const overrides = useRef(new Map<string, number>())
  const drag = useRef<{ id: string; offset: number; startX: number; moved: boolean } | null>(null)
  const frame = useRef<(() => void) | null>(null)
  const lastTime = useRef(0)
  /** 正在把文件拖到别的应用，到这个时间点之前保持绳子展开、窗口可交互 */
  const dragOutUntil = useRef(0)
  /** 拖过的挂件叠到最上面 */
  const topZ = useRef(1)
  // 滑入滑出也由这个循环驱动（弹簧），不用 CSS transition，方便统计到底出了几帧
  const stripRef = useRef<HTMLDivElement>(null)
  const payloadRef = useRef<OverlayPayload | null>(null)
  const shownRef = useRef(false)
  const slide = useRef({ pos: -1000, vel: 0 })
  /** 诊断：本次滑入 / 滑出动画出了多少帧、用了多久 */
  const slideStats = useRef({ frames: 0, start: 0, last: '' })

  const setInteractive = useCallback((next: boolean) => {
    if (interactive.current === next) return
    interactive.current = next
    window.overlay?.log('interactive', next)
    window.overlay?.setInteractive(next)
  }, [])

  const tick = useCallback((time: number) => {
    const r = rope.current
    if (!r) {
      frame.current = null
      return
    }
    // 按真实经过的时间补算（帧很稀疏时也能及时走到终点），每小步不超过 1/60s
    let remaining = Math.min(0.5, (time - lastTime.current) / 1000 || 1 / 60)
    lastTime.current = time
    const xOf = (it: LineItem) => overrides.current.get(it.id) ?? it.x * r.width
    const loads: Load[] = items.current.map((it) => ({ x: xOf(it), weight: WEIGHT[it.type] }))
    const pl = payloadRef.current
    const sl = slide.current
    const target = pl ? (shownRef.current ? 0 : -(PANEL_HEIGHT + pl.topInset + 12)) : 0
    if (sl.pos === -1000) sl.pos = target
    // 滑下来带一点回弹，收起时快速、不回弹
    const k = shownRef.current ? 260 : 600
    const c = shownRef.current ? 2 * Math.sqrt(k) * 0.72 : 2 * Math.sqrt(k)

    while (remaining > 1e-6) {
      const dt = Math.min(1 / 60, remaining)
      remaining -= dt
      r.step(dt, loads)
      for (const it of items.current) {
        let p = pendulums.current.get(it.id)
        if (!p) {
          p = new Pendulum()
          pendulums.current.set(it.id, p)
        }
        const x = xOf(it)
        p.step(dt, x, r.yAt(x))
      }
      sl.vel += (-(sl.pos - target) * k - c * sl.vel) * dt
      sl.pos += sl.vel * dt
    }

    let resting = r.motion() < 0.5 && !drag.current
    for (const it of items.current) {
      const p = pendulums.current.get(it.id)!
      if (!p.isResting()) resting = false
      const el = elements.current.get(it.id)
      if (!el) continue
      const x = xOf(it)
      el.style.translate = `${x - CARD_WIDTH / 2}px ${r.yAt(x) - PIN_ABOVE - HANDLE_PAD}px`
      el.style.rotate = `${tiltOf(it.id) + (p.angle * 180) / Math.PI}deg`
      // 靠近屏幕边缘的淡出
      el.style.opacity = String(Math.min(1, Math.max(0, Math.min(x, r.width - x) / 90)))
    }
    if (canvasRef.current) drawRope(canvasRef.current, r)

    if (pl && stripRef.current) {
      const st = slideStats.current
      if (Math.abs(sl.pos - target) < 0.5 && Math.abs(sl.vel) < 5) {
        if (st.start) {
          st.last = `${shownRef.current ? '滑入' : '收起'} ${st.frames} 帧 / ${Math.round(time - st.start)}ms`
          st.start = 0
        }
        sl.pos = target
        sl.vel = 0
      } else {
        resting = false
        if (st.start) st.frames++
      }
      stripRef.current.style.translate = `0 ${sl.pos}px`
    }
    // 静止后停掉循环，有新动静时再唤醒
    frame.current = resting ? null : schedule(tick)
  }, [])

  const wake = useCallback(() => {
    if (frame.current) return
    lastTime.current = performance.now()
    frame.current = schedule(tick)
  }, [tick])

  const reveal = useCallback(
    (next: boolean, reason = '') => {
      if (revealedRef.current === next) return
      window.overlay?.log(next ? 'reveal' : 'hide', { reason, visibility: document.visibilityState, focus: document.hasFocus() })
      // 拉下后 1 秒统计出帧情况：raf 很少而 timer 很多，说明动画帧回调被卡住了
      const before = { ...frameStats }
      setTimeout(() => {
        window.overlay?.log('frames-1s', {
          after: next ? 'reveal' : 'hide',
          raf: frameStats.raf - before.raf,
          timer: frameStats.timer - before.timer,
          focus: document.hasFocus(),
          slide: slideStats.current.last,
        })
      }, 1000)
      if (next && (reason === 'edge' || reason.startsWith('handle'))) window.overlay?.focusOnReveal()
      revealedRef.current = next
      setRevealed(next)
      // 透明窗口不在前台时可能不重绘，状态变化时请主界面让悬浮层整页重绘一次
      window.overlay?.repaint()
      if (next) {
        // 滑下来时吹一阵风
        for (const p of pendulums.current.values()) p.kick((Math.random() - 0.3) * 1.4)
        wake()
      } else {
        setInteractive(false)
      }
    },
    [setInteractive, wake],
  )

  const bind = useCallback(
    (id: string, el: HTMLDivElement | null) => {
      if (el) elements.current.set(id, el)
      else elements.current.delete(id)
      wake()
    },
    [wake],
  )

  const onDragOut = useCallback(() => {
    dragOutUntil.current = Date.now() + DRAG_OUT_MAX_MS
  }, [])

  // 挂件的 api.line.*：宿主（WidgetFrame）已经校验过参数和频率
  const onWidgetLine = useCallback(
    (id: string, op: LineOp, value?: boolean) => {
      switch (op) {
        case 'keepOpen':
          if (value) keepOpen.current.add(id)
          else keepOpen.current.delete(id)
          break
        case 'focus':
          setFocusOwner((cur) => (value ? id : cur === id ? null : cur))
          break
        case 'collapse':
          peekUntil.current = 0
          if (payloadRef.current?.mode !== 'pinned') reveal(false, `widget-collapse:${id}`)
          break
        case 'reveal':
          peekUntil.current = Date.now() + 5000
          reveal(true, `widget-reveal:${id}`)
          break
      }
    },
    [reveal],
  )

  const onWidgetHandle = useCallback((id: string, value: HandleContent | null) => {
    setHandleContent((cur) => (value ? { ...value, owner: id } : cur?.owner === id ? null : cur))
  }, [])

  const revealedOrPinned = () => revealedRef.current || payloadRef.current?.mode === 'pinned'

  const kick = useCallback(
    (id: string, amount: number) => {
      pendulums.current.get(id)?.kick(amount)
      wake()
    },
    [wake],
  )

  useEffect(() => {
    window.overlay?.onState((p) => {
      const isDark = !!window.overlay?.isDarkColors()
      applyTheme(isDark)
      setDark(isDark)
      setPayload(p)
    })
    window.overlay?.onPeek((duration) => {
      peekUntil.current = Date.now() + (duration ?? PEEK_MS)
      reveal(true, 'peek')
    })
    window.overlay?.ready()
  }, [reveal])

  // 新状态：同步绳子宽度、挂件和重量；新挂上的东西让绳子弹一下
  useEffect(() => {
    if (!payload) return
    const width = payload.bounds.width
    if (!rope.current || rope.current.width !== width) rope.current = new Rope(width)
    const r = rope.current
    const known = new Set(items.current.map((it) => it.id))
    for (const it of payload.items) {
      if (known.has(it.id)) continue
      const p = new Pendulum()
      p.angle = 0.28
      pendulums.current.set(it.id, p)
      r.pluck(it.x * width, 260)
    }
    const ids = new Set(payload.items.map((it) => it.id))
    for (const id of pendulums.current.keys()) if (!ids.has(id)) pendulums.current.delete(id)
    // 主界面确认了新位置，就不再需要本地覆盖
    for (const it of payload.items) {
      const o = overrides.current.get(it.id)
      if (o !== undefined && drag.current?.id !== it.id && Math.abs(o - it.x * width) < 1) overrides.current.delete(it.id)
    }
    items.current = payload.items
    wake()
  }, [payload, wake])

  useEffect(
    () => () => {
      frame.current?.()
    },
    [],
  )

  const pinned = payload?.mode === 'pinned'
  const shown = pinned || revealed

  useEffect(() => {
    payloadRef.current = payload
  }, [payload])

  useEffect(() => {
    shownRef.current = shown
    slideStats.current.frames = 0
    // 第一次拿到状态时直接放到终点，不算一次动画
    slideStats.current.start = slide.current.pos === -1000 ? 0 : performance.now()
    wake()
  }, [shown, wake])

  // 轮询光标（两种模式都跑）：
  // - 拖文件出去时，按光标位置决定接不接收落点：在绳子区域里就接收（挂到绳上），否则点击穿透交给下面的应用
  // - 自动隐藏：鼠标顶到屏幕上边缘就滑出，离开晾衣绳就收起
  useEffect(() => {
    if (!payload) return
    const { bounds, topInset, notch, hideDelay } = payload
    const center = bounds.x + bounds.width / 2
    let edgeSince = 0
    let awaySince = 0
    let lastX = 0
    let lastY = 0
    let stillSince = 0
    /** 光标是否在挂着的东西上（包括展开到绳子区域以下的衣架、菜单） */
    const overHit = (p: { x: number; y: number }) =>
      !!document.elementFromPoint(p.x - bounds.x, p.y - bounds.y)?.closest('[data-hit]')
    return window.overlay?.watchCursor((p) => {
      const now = Date.now()
      const inside = p.x >= bounds.x && p.x < bounds.x + bounds.width && p.y >= bounds.y && p.y < bounds.y + bounds.height
      const inStrip = inside && p.y < bounds.y + topInset + PANEL_HEIGHT

      // 正在拖文件出去：系统拖拽结束不会通知网页，按光标停住判断拖拽已经结束
      if (now < dragOutUntil.current) {
        if (p.x !== lastX || p.y !== lastY) stillSince = now
        else if (now - stillSince > DRAG_OUT_STILL_MS) dragOutUntil.current = 0
        lastX = p.x
        lastY = p.y
        awaySince = 0
        setInteractive(inStrip && revealedOrPinned())
        return POLL_FAST
      }
      if (pinned) return POLL_IDLE

      if (!revealedRef.current) {
        awaySince = 0
        // 刘海那一段不触发：鼠标推进刘海通常是想用刘海里的东西
        const inNotch = notch && Math.abs(p.x - center) < NOTCH_HALF
        if (inside && p.y <= bounds.y + 1 && !inNotch) {
          edgeSince ||= now
          if (now - edgeSince >= REVEAL_DWELL_MS) reveal(true, 'edge')
        } else {
          edgeSince = 0
        }
        return inside && p.y - bounds.y < NEAR_TOP ? POLL_FAST : POLL_IDLE
      }
      edgeSince = 0
      const away = !inside || (p.y > bounds.y + topInset + PANEL_HEIGHT + 30 && !overHit(p))
      if (away && now >= peekUntil.current && !drag.current && keepOpen.current.size === 0) {
        awaySince ||= now
        if (now - awaySince >= hideDelay) reveal(false, 'away')
      } else {
        awaySince = 0
      }
      return POLL_FAST
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, pinned, reveal, setInteractive])

  const nearRope = (clientX: number, clientY: number) => {
    if (!rope.current || !payload) return false
    return Math.abs(rope.current.yAt(clientX) - (clientY - payload.topInset)) < ROPE_HIT
  }

  // 整窗默认点击穿透，forward 模式下仍收到 mousemove：
  // 鼠标在挂件、绳子上，或自动模式下在滑出的晾衣绳区域里，就关闭穿透
  useEffect(() => {
    if (!payload) return
    const stripBottom = payload.topInset + PANEL_HEIGHT
    const onMove = (e: MouseEvent) => {
      if (drag.current) return
      dragOutUntil.current = 0
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const overItem = !!el?.closest('[data-hit]')
      const onRope = shown && nearRope(e.clientX, e.clientY)
      const inStrip = revealed && !pinned && e.clientY < stripBottom
      document.body.style.cursor = onRope && !overItem ? 'copy' : ''
      setInteractive(overItem || onRope || inStrip)
    }
    const onLeave = () => {
      if (!drag.current && Date.now() >= dragOutUntil.current) setInteractive(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload, shown, revealed, pinned, setInteractive])

  // 拖夹子：沿绳子左右移动，松手后保存位置
  const onPinDown = useCallback(
    (e: ReactPointerEvent, id: string, onClick: () => void) => {
      const r = rope.current
      const it = items.current.find((i) => i.id === id)
      if (!r || !it || e.button !== 0) return
      e.preventDefault()
      const current = overrides.current.get(id) ?? it.x * r.width
      drag.current = { id, offset: e.clientX - current, startX: e.clientX, moved: false }
      const el = elements.current.get(id)
      if (el) el.style.zIndex = String(++topZ.current)
      setInteractive(true)
      const move = (ev: PointerEvent) => {
        const d = drag.current
        if (!d) return
        if (Math.abs(ev.clientX - d.startX) > 3) d.moved = true
        const x = Math.min(r.width * X_MAX, Math.max(r.width * X_MIN, ev.clientX - d.offset))
        overrides.current.set(id, x)
        wake()
      }
      const up = () => {
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        const d = drag.current
        drag.current = null
        if (!d) return
        const x = overrides.current.get(id)
        if (d.moved && x !== undefined) window.overlay?.move(id, x / r.width)
        else {
          overrides.current.delete(id)
          onClick()
        }
        wake()
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
    },
    [setInteractive, wake],
  )

  if (!payload) return null
  const width = payload.bounds.width

  return (
    <>
      <div
        ref={stripRef}
        // 收起时整根绳子藏到屏幕上边缘外面，像自动隐藏的 Dock；位置由物理循环每帧写入
        className="absolute left-0 w-full"
        style={{ top: payload.topInset, height: PANEL_HEIGHT }}
        onClick={(e) => {
          // 点绳子空白处：加一个空夹子
          if ((e.target as Element).closest('[data-hit]')) return
          if (nearRope(e.clientX, e.clientY)) window.overlay?.addClip(e.clientX / width)
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const clipId = (e.target as Element).closest<HTMLElement>('[data-clip]')?.dataset.clip
          window.overlay?.drop(e.dataTransfer.files, e.clientX / width, clipId)
        }}
      >
        <canvas ref={canvasRef} className="pointer-events-none absolute top-0 left-0" style={{ width, height: PANEL_HEIGHT }} />
        {payload.items.length === 0 && (
          <div className="pointer-events-none absolute top-[44px] left-1/2 -translate-x-1/2 rounded-full border border-white/50 bg-background/85 px-3 py-1.5 text-xs font-medium text-muted-foreground shadow dark:border-white/15">
            点绳子加个夹子，或截图、在 uTools 里选「挂到晾衣绳」
          </div>
        )}
        {payload.items.map((item) => (
          <Pegged
            key={item.id}
            item={item}
            extension={item.type === 'widget' ? payload.extensions.find((e) => e.id === item.ext) : undefined}
            extensions={payload.extensions}
            themeKey={dark}
            bind={bind}
            onPinDown={onPinDown}
            kick={kick}
            onDragOut={onDragOut}
            dimmed={focusOwner !== null && focusOwner !== item.id}
            onWidgetLine={onWidgetLine}
            onWidgetHandle={onWidgetHandle}
          />
        ))}
      </div>
      {payload.debug && <DebugHud stats={slideStats} revealed={revealed} />}
      {/* 收起时屏幕顶部中间留一个小把手：碰一下就拉下来 */}
      {!shown && (
        <div
          data-hit
          title="拉下晾衣绳"
          className="group absolute flex -translate-x-1/2 cursor-pointer justify-center px-6 pt-1 pb-2"
          style={{ top: payload.topInset, left: `${HANDLE_X[payload.handle] * 100}%` }}
          onMouseEnter={() => reveal(true, 'handle-hover')}
          onClick={() => reveal(true, 'handle-click')}
        >
          {handleContent && (handleContent.text || handleContent.progress !== undefined) ? (
            // 挂件占用了把手（api.handle.set）：显示它的文字和进度
            <div className="relative flex h-5 min-w-14 items-center justify-center overflow-hidden rounded-full bg-neutral-900/75 px-2.5 text-[11px] font-medium whitespace-nowrap text-white shadow-[0_1px_4px_rgba(0,0,0,0.25)] transition group-hover:bg-neutral-900/90">
              {handleContent.progress !== undefined && (
                <div
                  className="absolute inset-y-0 left-0 bg-white/20 transition-[width] duration-700"
                  style={{ width: `${handleContent.progress * 100}%` }}
                />
              )}
              <span className="relative tabular-nums">{handleContent.text}</span>
            </div>
          ) : (
            <div className="h-[5px] w-14 rounded-full bg-neutral-500/40 shadow-[0_0_0_0.5px_rgba(255,255,255,0.5)] transition group-hover:w-20 group-hover:bg-neutral-500/70" />
          )}
        </div>
      )}
    </>
  )
}

/** 开发模式下的诊断信息：判断滑出时是不是没出帧（页面被当成不可见、窗口不在前台等） */
function DebugHud({ stats, revealed }: { stats: React.RefObject<{ last: string }>; revealed: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let changes = 0
    const render = () => {
      if (!ref.current) return
      ref.current.textContent = [
        `visibility: ${document.visibilityState} (变化 ${changes} 次)`,
        `focus: ${document.hasFocus() ? '是' : '否'}`,
        `revealed: ${revealed ? '是' : '否'}`,
        `上次动画: ${stats.current.last || '-'}`,
      ].join('\n')
    }
    const onVis = () => {
      changes++
      render()
    }
    document.addEventListener('visibilitychange', onVis)
    const timer = setInterval(render, 500)
    render()
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      clearInterval(timer)
    }
  }, [stats, revealed])
  return (
    <div
      ref={ref}
      className="pointer-events-none fixed right-3 bottom-3 rounded-md bg-black/70 px-2 py-1.5 font-mono text-[11px] leading-4 whitespace-pre text-white"
    />
  )
}
