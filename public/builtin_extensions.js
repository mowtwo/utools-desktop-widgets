// 内置案例扩展：跟着程序走，不写进数据库，数据库被清空也还在。
// 用户改过的版本以同 id 存进数据库（customized），覆盖这里的；在扩展页「恢复默认」就删掉那份
const clock = `// 时钟：每秒刷新一次
defineWidget((ctx) => {
  const pad = (n) => String(n).padStart(2, '0')
  ctx.every(1000, () => ctx.update())

  return () => {
    const now = new Date()
    let time = pad(now.getHours()) + ':' + pad(now.getMinutes())
    if (ctx.settings.showSeconds) time += ':' + pad(now.getSeconds())
    const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })
    return ui.column({ align: 'center', justify: 'center', gap: 2 }, [
      ui.text(time, { size: '2xl', weight: 'bold', mono: true }),
      ui.text(date, { size: 'xs', color: 'muted' }),
    ])
  }
})
`

const pomodoro = `// 番茄钟：开始后进入专注——隐藏其他挂件、收起晾衣绳、把手上显示倒计时；
// 结束时弹出晾衣绳并发通知
defineWidget((ctx) => {
  const total = (ctx.settings.minutes || 25) * 60
  const focusMode = ctx.settings.focusMode !== false
  // 重启后接着计时
  let endAt = ctx.storage.get('endAt') || 0
  let left = ctx.storage.get('left') ?? total

  const remaining = () => (endAt ? Math.max(0, Math.round((endAt - Date.now()) / 1000)) : left)
  const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
  const save = () => {
    ctx.storage.set('endAt', endAt)
    ctx.storage.set('left', left)
  }
  const enterFocus = () => {
    if (!focusMode) return
    ctx.line.focus(true)
    ctx.line.collapse()
  }
  const leaveFocus = () => {
    ctx.line.focus(false)
    ctx.handle.clear()
  }

  const toggle = () => {
    if (endAt) {
      left = remaining()
      endAt = 0
      leaveFocus()
    } else {
      endAt = Date.now() + left * 1000
      enterFocus()
    }
    save()
    ctx.update()
  }
  const reset = () => {
    endAt = 0
    left = total
    leaveFocus()
    save()
    ctx.update()
  }

  ctx.every(1000, () => {
    if (!endAt) return
    const s = remaining()
    if (s === 0) {
      endAt = 0
      left = total
      save()
      leaveFocus()
      ctx.line.reveal()
      ctx.notify('番茄钟结束，休息一下')
    } else if (focusMode) {
      ctx.handle.set({ text: '🍅 ' + fmt(s), progress: 1 - s / total })
    }
    ctx.update()
  })

  if (endAt) enterFocus()

  return () => {
    const s = remaining()
    return ui.column({ align: 'center', justify: 'center', gap: 6 }, [
      ui.text(fmt(s), { size: '2xl', weight: 'bold', mono: true }),
      ui.progress(1 - s / total, { height: 3 }),
      ui.row({ gap: 6 }, [
        ui.button(endAt ? '暂停' : '开始', { variant: 'primary', onClick: toggle }),
        ui.button('重置', { onClick: reset }),
      ]),
    ])
  }
})
`

module.exports = [
  { id: 'clock', name: '时钟', code: clock, width: 136, height: 64, settings: '{\n  "showSeconds": false\n}', builtin: true },
  {
    id: 'pomodoro',
    name: '番茄钟',
    code: pomodoro,
    width: 136,
    height: 92,
    settings: '{\n  "minutes": 25,\n  "focusMode": true\n}',
    builtin: true,
  },
]
