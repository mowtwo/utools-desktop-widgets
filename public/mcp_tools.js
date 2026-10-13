// MCP 工具：让 AI Agent 挂东西到晾衣绳、读取和取下绳上的东西、操作待办、直接发信号
// 工具声明（名称、描述、参数 Schema）在 plugin.json 的 tools 字段，两边名称必须一致；
// 状态都在主 preload 里，这里只通过 ctx 调用它提供的函数
const fs = require('node:fs')

/** 开源风格的信号：AI 按语义选一个（原版风格由悬浮层换成意思最接近的信号） */
const SIGNALS = {
  alert: '注意',
  danger: '危险',
  coming: '在路上',
  help: '求助',
  look: '看这里',
  question: '问号',
  done: '完成',
  idea: '好主意',
  ok: '收到',
  wait: '等一下',
  go: '冲',
  hot: '着火了',
  target: '目标',
}

/** 屏幕上的预设位置（占屏幕宽高的比例） */
const POSITIONS = {
  center: [0.5, 0.5],
  top: [0.5, 0.2],
  bottom: [0.5, 0.8],
  left: [0.2, 0.5],
  right: [0.8, 0.5],
  'top-left': [0.2, 0.2],
  'top-right': [0.8, 0.2],
  'bottom-left': [0.2, 0.8],
  'bottom-right': [0.8, 0.8],
}

const ITEM_TYPES = ['image', 'note', 'file', 'todo', 'widget', 'clip']

function describeItem(it, ctx) {
  const base = { id: it.id, type: it.type, position: Math.round(it.x * 1000) / 1000, created_at: it.createdAt }
  // 每块屏幕一根晾衣绳时，说明挂在哪块屏幕上
  if (ctx.multiLine()) base.display = ctx.itemDisplayId(it)
  switch (it.type) {
    case 'image':
      return { ...base, path: it.path }
    case 'note':
      return { ...base, text: it.text }
    case 'file':
      return { ...base, path: it.path, name: it.name, is_directory: !!it.isDirectory, exists: fs.existsSync(it.path) }
    case 'todo':
      return {
        ...base,
        color: it.color,
        quick_add_target: ctx.todoTarget()?.id === it.id,
        lines: it.lines.map((l) => ({ id: l.id, text: l.text, done: l.done })),
      }
    case 'widget':
      return { ...base, extension: ctx.extensionName(it.ext) }
    default:
      return base
  }
}

function strings(list, field) {
  if (list === undefined) return []
  if (!Array.isArray(list) || list.some((v) => typeof v !== 'string')) throw new Error(`${field} 必须是字符串数组`)
  return list.filter((v) => v.trim())
}

function findCard(ctx, cardId) {
  const card = ctx.state().items.find((it) => it.id === cardId && it.type === 'todo')
  if (!card) throw new Error(`找不到待办卡「${cardId}」，可以先调用 get_clothesline 查看`)
  return card
}

function findLine(card, lineId) {
  const line = card.lines.find((l) => l.id === lineId)
  if (!line) throw new Error(`待办卡里没有条目「${lineId}」`)
  return line
}

function registerMcpTools(api, ctx) {
  api.registerTool('get_clothesline', ({ type } = {}) => {
    if (type !== undefined && !ITEM_TYPES.includes(type)) throw new Error(`type 只能是 ${ITEM_TYPES.join(' / ')}`)
    const s = ctx.state()
    const items = [...s.items].sort((a, b) => a.x - b.x).filter((it) => !type || it.type === type)
    const lines = ctx.lineDisplayIds()
    return {
      displays: ctx.displays().map((d, i) => ({
        id: d.id,
        name: d.label || `屏幕 ${i + 1}`,
        width: d.bounds.width,
        height: d.bounds.height,
        primary: d.id === ctx.primaryId(),
        has_clothesline: lines.includes(d.id),
      })),
      visible: s.enabled,
      mode: s.mode === 'pinned' ? 'pinned' : 'auto_hide',
      max_items: s.maxItems,
      items: items.map((it) => describeItem(it, ctx)),
    }
  })

  api.registerTool('hang_on_clothesline', ({ files, notes } = {}) => {
    const paths = strings(files, 'files')
    const texts = strings(notes, 'notes')
    if (!paths.length && !texts.length) throw new Error('files 和 notes 至少给一个')
    const missing = paths.filter((p) => !fs.existsSync(p))
    const before = new Set(ctx.state().items.map((it) => it.id))
    const newItems = [...ctx.fileItems(paths), ...texts.map(ctx.noteItem).filter(Boolean)]
    if (!newItems.length) throw new Error(`文件都不存在：${missing.join('、')}（需要绝对路径）`)
    ctx.ensureVisible()
    ctx.hang(newItems)
    const after = ctx.state().items
    const ids = new Set(after.map((it) => it.id))
    return {
      hung: after.filter((it) => !before.has(it.id)).map((it) => describeItem(it, ctx)),
      // 超过数量上限时，最旧的东西会掉下去
      dropped: [...before].filter((id) => !ids.has(id)),
      missing,
    }
  })

  api.registerTool('remove_from_clothesline', ({ ids, all } = {}) => {
    const list = strings(ids, 'ids')
    if (!all && !list.length) throw new Error('给出要取下的 ids，或者 all: true 取下全部')
    const items = ctx.state().items
    // 取下全部时保留挂件，与设置页的「清空」一致
    const targets = all ? items.filter((it) => it.type !== 'widget') : items.filter((it) => list.includes(it.id))
    for (const it of targets) ctx.removeItem(it.id)
    const found = new Set(targets.map((it) => it.id))
    return { removed: [...found], not_found: list.filter((id) => !found.has(id)) }
  })

  api.registerTool('add_todo', ({ text, card_id, new_card } = {}) => {
    const t = ctx.todoText(text || '')
    if (!t) throw new Error('text 不能为空')
    const truncated = Array.from(t).length < Array.from(String(text).replace(/\s+/g, ' ').trim()).length
    ctx.ensureVisible()
    let card
    if (new_card) {
      card = ctx.newTodoCard(t)
    } else {
      card = card_id ? findCard(ctx, card_id) : ctx.todoTarget()
      if (!card) {
        card = ctx.newTodoCard(t)
      } else {
        if (card.lines.length >= ctx.TODO_LINES) {
          throw new Error(`待办卡「${card.id}」已经有 ${ctx.TODO_LINES} 条了，删掉几条，或者用 new_card: true 新建一张`)
        }
        ctx.addTodoLine(t, card.id)
        card = findCard(ctx, card.id)
      }
    }
    const line = card.lines[card.lines.length - 1]
    return { card_id: card.id, line_id: line.id, text: line.text, truncated }
  })

  api.registerTool('update_todo', ({ card_id, line_id, done, text } = {}) => {
    const card = findCard(ctx, card_id)
    if (line_id === undefined) {
      if (done !== true || text !== undefined) throw new Error('不给 line_id 时只能用 done: true 把整张卡片标成已完成')
      ctx.completeTodoCard(card.id)
      return { card_id: card.id, lines: findCard(ctx, card.id).lines }
    }
    findLine(card, line_id)
    if (done === undefined && text === undefined) throw new Error('done 和 text 至少给一个')
    let newText
    if (text !== undefined) {
      newText = ctx.todoText(text)
      if (!newText) throw new Error('text 不能为空')
    }
    ctx.updateTodoLine(card.id, line_id, { ...(done !== undefined ? { done: !!done } : {}), ...(newText ? { text: newText } : {}) })
    return { card_id: card.id, line: findLine(findCard(ctx, card.id), line_id) }
  })

  api.registerTool('remove_todo', ({ card_id, line_id } = {}) => {
    const card = findCard(ctx, card_id)
    if (line_id === undefined) {
      ctx.removeItem(card.id)
      return { removed_card: card.id }
    }
    findLine(card, line_id)
    ctx.removeTodoLine(card.id, line_id)
    // 最后一条删掉后卡片会被一起取下
    const left = ctx.state().items.some((it) => it.id === card.id)
    return { removed_line: line_id, card_removed: !left }
  })

  api.registerTool('send_ping', ({ signal, position, x, y, display } = {}) => {
    if (!SIGNALS[signal]) throw new Error(`signal 只能是 ${Object.keys(SIGNALS).join(' / ')}`)
    if ((x === undefined) !== (y === undefined)) throw new Error('x 和 y 要一起给')
    if (x !== undefined && !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) throw new Error('x、y 是占屏幕宽高的比例，范围 0~1')
    const at = position || 'cursor'
    if (at !== 'cursor' && !POSITIONS[at]) throw new Error(`position 只能是 cursor / ${Object.keys(POSITIONS).join(' / ')}`)
    const cursor = ctx.cursorPoint()
    const cursorDisplay = ctx.displayAt(cursor)
    // 发在哪块屏幕上：默认是光标所在的那块（用户正在看的）；all 是每块屏幕各发一个
    let targets
    if (display === undefined || display === 'cursor') targets = [cursorDisplay]
    else if (display === 'all') targets = ctx.displays()
    else {
      const found = ctx.displays().find((d) => String(d.id) === String(display))
      if (!found) throw new Error(`找不到屏幕「${display}」，屏幕 id 可以用 get_clothesline 查看`)
      targets = [found]
    }
    const sent = targets.map((d) => {
      const b = d.bounds
      let point
      if (x !== undefined) point = { x: b.x + b.width * x, y: b.y + b.height * y }
      // 光标不在这块屏幕上时，cursor 改成屏幕中间
      else if (at === 'cursor') point = d.id === cursorDisplay.id ? cursor : { x: b.x + b.width / 2, y: b.y + b.height / 2 }
      else point = { x: b.x + b.width * POSITIONS[at][0], y: b.y + b.height * POSITIONS[at][1] }
      ctx.firePing({ x: Math.round(point.x), y: Math.round(point.y), signal })
      return { display: d.id, x: Math.round(point.x - b.x), y: Math.round(point.y - b.y) }
    })
    return { signal, label: SIGNALS[signal], style: ctx.state().ping.style === 'open' ? 'open' : 'lol', sent }
  })
}

module.exports = { registerMcpTools }
