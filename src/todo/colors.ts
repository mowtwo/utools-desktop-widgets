import type { TodoColor } from '@/types/line'

/** 待办卡片的 5 套配色：底色、边框、文字、勾选圈，亮色和暗色主题各一套 */
export const TODO_COLORS: Record<TodoColor, { label: string; swatch: string; card: string; ring: string }> = {
  amber: {
    label: '琥珀',
    swatch: '#f59e0b',
    card: 'border-amber-300/60 bg-amber-50/95 text-amber-950 dark:border-amber-200/20 dark:bg-amber-950/90 dark:text-amber-50',
    ring: 'border-amber-600/60 hover:border-amber-600 hover:bg-amber-500/15 dark:border-amber-200/50',
  },
  rose: {
    label: '玫瑰',
    swatch: '#f43f5e',
    card: 'border-rose-300/60 bg-rose-50/95 text-rose-950 dark:border-rose-200/20 dark:bg-rose-950/90 dark:text-rose-50',
    ring: 'border-rose-600/60 hover:border-rose-600 hover:bg-rose-500/15 dark:border-rose-200/50',
  },
  sky: {
    label: '天蓝',
    swatch: '#0ea5e9',
    card: 'border-sky-300/60 bg-sky-50/95 text-sky-950 dark:border-sky-200/20 dark:bg-sky-950/90 dark:text-sky-50',
    ring: 'border-sky-600/60 hover:border-sky-600 hover:bg-sky-500/15 dark:border-sky-200/50',
  },
  emerald: {
    label: '翠绿',
    swatch: '#10b981',
    card: 'border-emerald-300/60 bg-emerald-50/95 text-emerald-950 dark:border-emerald-200/20 dark:bg-emerald-950/90 dark:text-emerald-50',
    ring: 'border-emerald-600/60 hover:border-emerald-600 hover:bg-emerald-500/15 dark:border-emerald-200/50',
  },
  violet: {
    label: '紫罗兰',
    swatch: '#8b5cf6',
    card: 'border-violet-300/60 bg-violet-50/95 text-violet-950 dark:border-violet-200/20 dark:bg-violet-950/90 dark:text-violet-50',
    ring: 'border-violet-600/60 hover:border-violet-600 hover:bg-violet-500/15 dark:border-violet-200/50',
  },
}

export const TODO_COLOR_IDS = Object.keys(TODO_COLORS) as TodoColor[]
