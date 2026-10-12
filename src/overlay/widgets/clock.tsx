import { useEffect, useState } from 'react'

export function ClockView({ showSeconds }: { showSeconds: boolean }) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const time = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: false,
  })
  const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })

  return (
    <div className="rounded-2xl border border-border bg-background/70 px-5 py-3 text-foreground shadow-lg backdrop-blur-xl">
      <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight">{time}</div>
      <div className="mt-1 text-sm text-muted-foreground">{date}</div>
    </div>
  )
}
