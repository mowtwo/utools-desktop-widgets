// 信号：屏幕上任意位置发一个带图标的标记，可以顺手截一块图
// 交互参考 lolPing（MIT）的信号轮盘；图标、配色是我们自己的，不使用游戏素材；
// 音效来自 Kenney Interface Sounds（CC0，public/sounds）

import {
  ArrowBigUp,
  CircleCheck,
  CircleQuestionMark,
  Crosshair,
  Eye,
  Flame,
  Hourglass,
  LifeBuoy,
  Lightbulb,
  Navigation,
  OctagonX,
  ThumbsUp,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'

export interface Signal {
  id: string
  label: string
  color: string
  Icon: LucideIcon
  /** public/sounds 下的音效文件名 */
  sound: string
}

export const SIGNALS: Signal[] = [
  { id: 'alert', label: '注意', color: '#f59e0b', Icon: TriangleAlert, sound: 'bong_001' },
  { id: 'danger', label: '危险', color: '#ef4444', Icon: OctagonX, sound: 'error_004' },
  { id: 'coming', label: '在路上', color: '#22c55e', Icon: Navigation, sound: 'pluck_001' },
  { id: 'help', label: '求助', color: '#f97316', Icon: LifeBuoy, sound: 'drop_002' },
  { id: 'look', label: '看这里', color: '#0ea5e9', Icon: Eye, sound: 'glass_001' },
  { id: 'question', label: '问号', color: '#8b5cf6', Icon: CircleQuestionMark, sound: 'question_001' },
  { id: 'done', label: '完成', color: '#10b981', Icon: CircleCheck, sound: 'confirmation_001' },
  { id: 'idea', label: '好主意', color: '#eab308', Icon: Lightbulb, sound: 'glass_005' },
  { id: 'ok', label: '收到', color: '#3b82f6', Icon: ThumbsUp, sound: 'select_001' },
  { id: 'wait', label: '等一下', color: '#64748b', Icon: Hourglass, sound: 'tick_001' },
  { id: 'go', label: '冲', color: '#e11d48', Icon: ArrowBigUp, sound: 'maximize_001' },
  { id: 'hot', label: '着火了', color: '#dc2626', Icon: Flame, sound: 'error_007' },
  { id: 'target', label: '目标', color: '#db2777', Icon: Crosshair, sound: 'toggle_001' },
]

/** 轮盘默认从正上方开始顺时针排的 8 个信号 */
export const DEFAULT_WHEEL = ['alert', 'coming', 'help', 'look', 'done', 'idea', 'question', 'danger']

export const signalById = (id: string) => SIGNALS.find((s) => s.id === id) ?? SIGNALS[0]

/** 截图尺寸预设（DIP） */
export const CAPTURE_SIZES = [
  { w: 320, h: 200 },
  { w: 480, h: 300 },
  { w: 640, h: 400 },
  { w: 800, h: 500 },
]

export const ICON_SIZES = { sm: 40, md: 56, lg: 76 } as const
export type IconSize = keyof typeof ICON_SIZES

/** 信号的圆形徽章：屏幕上的动画和截图里叠加的图标是同一个样子 */
export function SignalBadge({ signal, size }: { signal: Signal; size: number }) {
  const { Icon } = signal
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <circle cx="32" cy="32" r="30" fill={signal.color} stroke="white" strokeWidth="3" />
      <g transform="translate(16 16)" color="white">
        <Icon width={32} height={32} strokeWidth={2.4} />
      </g>
    </svg>
  )
}

/** 信号音效（默认关闭，在设置里打开） */
export function playPingSound(signal: Signal) {
  try {
    const audio = new Audio(`sounds/${signal.sound}.wav`)
    audio.volume = 0.6
    void audio.play().catch(() => {})
  } catch {
    // 没有音频设备时静默
  }
}
