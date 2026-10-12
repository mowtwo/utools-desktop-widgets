// 信号：屏幕上任意位置发一个带图标的标记，可以顺手截一块图
// 交互参考 lolPing（MIT）的信号轮盘，不使用游戏素材：
// - 图标：game-icons.net（CC BY 3.0，见 game-icons.ts 和 NOTICE）
// - 音效：Kenney Digital Audio / Interface Sounds（CC0，public/sounds）

import { GAME_ICONS } from './game-icons'

export interface Signal {
  id: string
  label: string
  color: string
}

export const SIGNALS: Signal[] = [
  { id: 'alert', label: '注意', color: '#f59e0b' },
  { id: 'danger', label: '危险', color: '#ef4444' },
  { id: 'coming', label: '在路上', color: '#22c55e' },
  { id: 'help', label: '求助', color: '#f97316' },
  { id: 'look', label: '看这里', color: '#0ea5e9' },
  { id: 'question', label: '问号', color: '#8b5cf6' },
  { id: 'done', label: '完成', color: '#10b981' },
  { id: 'idea', label: '好主意', color: '#eab308' },
  { id: 'ok', label: '收到', color: '#3b82f6' },
  { id: 'wait', label: '等一下', color: '#64748b' },
  { id: 'go', label: '冲', color: '#e11d48' },
  { id: 'hot', label: '着火了', color: '#dc2626' },
  { id: 'target', label: '目标', color: '#db2777' },
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

/** 信号在屏幕上停留的时长（ms） */
export const DURATIONS = [
  { ms: 1000, label: '1 秒' },
  { ms: 1600, label: '1.6 秒' },
  { ms: 2400, label: '2.4 秒' },
  { ms: 4000, label: '4 秒' },
]

/** 两套音效，每个信号各对应一个文件（public/sounds/<pack>/） */
export const SOUND_PACKS = {
  digital: {
    label: '数字',
    ext: 'ogg',
    files: {
      alert: 'two_tone_1',
      danger: 'low_three_tone',
      coming: 'high_up',
      help: 'three_tone_2',
      look: 'tone_1',
      question: 'pep_sound_2',
      done: 'power_up_2',
      idea: 'pep_sound_4',
      ok: 'pep_sound_1',
      wait: 'low_down',
      go: 'phaser_up_3',
      hot: 'zap_two_tone',
      target: 'three_tone_1',
    } as Record<string, string>,
  },
  interface: {
    label: '界面',
    ext: 'wav',
    files: {
      alert: 'bong_001',
      danger: 'error_004',
      coming: 'pluck_001',
      help: 'drop_002',
      look: 'glass_001',
      question: 'question_001',
      done: 'confirmation_001',
      idea: 'glass_005',
      ok: 'select_001',
      wait: 'tick_001',
      go: 'maximize_001',
      hot: 'error_007',
      target: 'toggle_001',
    } as Record<string, string>,
  },
}
export type SoundPack = keyof typeof SOUND_PACKS

/** 信号徽章：屏幕上的动画、轮盘、截图里叠加的图标都是它 */
export function SignalBadge({ signal, size }: { signal: Signal; size: number }) {
  const icon = GAME_ICONS[signal.id] ?? GAME_ICONS.alert
  const gid = `g-${signal.id}`
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      style={{ display: 'block', overflow: 'visible' }}
    >
      <defs>
        <radialGradient id={gid} cx="50%" cy="35%" r="70%">
          <stop offset="0" stopColor={signal.color} stopOpacity="1" />
          <stop offset="1" stopColor="#0b1220" stopOpacity="0.92" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={signal.color} opacity="0.28" />
      <circle cx="32" cy="32" r="27" fill={`url(#${gid})`} stroke={signal.color} strokeWidth="2.5" />
      <circle cx="32" cy="32" r="27" fill="none" stroke="white" strokeOpacity="0.55" strokeWidth="0.8" />
      <g transform="translate(14 14) scale(0.0703125)">
        <path d={icon.path} fill="white" />
      </g>
    </svg>
  )
}

/** 开源风格某个信号的音效地址 */
export function openSoundUrl(pack: SoundPack, signal: Signal) {
  const p = SOUND_PACKS[pack] ?? SOUND_PACKS.digital
  return `sounds/${pack}/${p.files[signal.id] ?? p.files.alert}.${p.ext}`
}

/** 设置页里试听；悬浮层里的播放走预先解码的 SoundBank */
export function previewSound(url: string) {
  try {
    const audio = new Audio(url)
    audio.volume = 0.7
    void audio.play().catch(() => {})
  } catch {
    // 没有音频设备时静默
  }
}
