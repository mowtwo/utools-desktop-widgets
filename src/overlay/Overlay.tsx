import { useEffect, useRef, useState } from 'react'
import type { Settings, Widget } from '@/types/settings'
import { WidgetFrame } from './WidgetFrame'
import { ClockView } from './widgets/clock'

interface Payload {
  settings: Settings
  bounds: Rect
}

function renderWidget(widget: Widget) {
  switch (widget.type) {
    case 'clock':
      return <ClockView showSeconds={widget.showSeconds} />
  }
}

function contains(bounds: Rect, x: number, y: number) {
  return x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height
}

export default function Overlay() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const interactive = useRef(false)
  const dragging = useRef(false)

  useEffect(() => {
    window.overlay?.onSettings(setPayload)
    window.overlay?.ready()
  }, [])

  // 整窗默认点击穿透，但 forward 模式下仍收到 mousemove：
  // 鼠标落在挂件上就关闭穿透，离开就恢复
  useEffect(() => {
    const setInteractive = (next: boolean) => {
      if (interactive.current === next) return
      interactive.current = next
      window.overlay?.setInteractive(next)
    }
    const onMove = (e: MouseEvent) => {
      if (dragging.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      setInteractive(!!el?.closest('[data-widget]'))
    }
    const onLeave = () => {
      if (!dragging.current) setInteractive(false)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onLeave)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  if (!payload) return null
  const { settings, bounds } = payload

  return (
    <>
      {settings.widgets
        .filter((w) => w.enabled && contains(bounds, w.x, w.y))
        .map((w) => (
          <WidgetFrame
            key={w.id}
            x={w.x - bounds.x}
            y={w.y - bounds.y}
            onDragStateChange={(d) => (dragging.current = d)}
            onMoved={(lx, ly) => window.overlay?.moveWidget(w.id, lx + bounds.x, ly + bounds.y)}
          >
            {renderWidget(w)}
          </WidgetFrame>
        ))}
    </>
  )
}
