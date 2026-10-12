import { useRef, useState, type ReactNode } from 'react'

interface Props {
  /** 悬浮层窗口内的坐标 */
  x: number
  y: number
  children: ReactNode
  onDragStateChange(dragging: boolean): void
  onMoved(x: number, y: number): void
}

/** 挂件外壳：标记可交互区域，支持拖动换位置 */
export function WidgetFrame({ x, y, children, onDragStateChange, onMoved }: Props) {
  // 拖动中用本地位置，松手后以设置里保存的位置为准
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ dx: number; dy: number } | null>(null)
  const pos = dragPos ?? { x, y }

  return (
    <div
      data-widget
      className="absolute cursor-grab touch-none active:cursor-grabbing"
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture(e.pointerId)
        drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        onDragStateChange(true)
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        setDragPos({
          x: Math.max(0, Math.min(window.innerWidth - 40, e.clientX - drag.current.dx)),
          y: Math.max(0, Math.min(window.innerHeight - 40, e.clientY - drag.current.dy)),
        })
      }}
      onPointerUp={() => {
        if (!drag.current) return
        drag.current = null
        onDragStateChange(false)
        onMoved(pos.x, pos.y)
        setDragPos(null)
      }}
    >
      {children}
    </div>
  )
}
