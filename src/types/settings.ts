export interface ClockWidget {
  id: string
  type: 'clock'
  enabled: boolean
  /** 屏幕全局坐标（DIP），落在哪块屏幕就显示在哪块屏幕的悬浮层上 */
  x: number
  y: number
  showSeconds: boolean
}

export type Widget = ClockWidget

export interface Settings {
  overlayEnabled: boolean
  widgets: Widget[]
}
