// 桌面地毯窗口的宿主层：替代 desktop-rug 原生（Swift）部分
// - 垫一个 window.webkit.messageHandlers.rug，让移植来的 rug.js 不用改通信代码
// - 按 rug.js 报来的地毯轮廓切换点击穿透：鼠标在地毯上才接收，其余点击落到桌面
// - 按住 Option 时把状态传给 rug.js（缩放、旋转、换花样）

const bridge = window.rugBridge
const params = new URLSearchParams(location.search)
const originX = Number(params.get('bx') || 0)
const originY = Number(params.get('by') || 0)

let poly = []
let dragging = false
let accept = false
let optionDown = false
let altKey = false

window.webkit = {
  messageHandlers: {
    rug: {
      postMessage(m) {
        switch (m && m.type) {
          case 'hit':
            poly = Array.isArray(m.poly) ? m.poly : []
            break
          case 'drag':
            dragging = !!m.active
            // 拖完把窗口推回最底层，免得盖住别的应用
            if (!dragging) setTimeout(() => bridge?.pushBack(), 300)
            break
          case 'material':
            bridge?.saveMaterial(m.id)
            break
          case 'quit':
            // 垃圾桶：收起地毯（下次打开还在原处）
            bridge?.hide()
            break
          case 'log':
            if (m.level === 'error') bridge?.log('rug-error', m.text)
            break
        }
      },
    },
  },
}

function inPolygon(x, y) {
  let inside = false
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const ax = poly[i], ay = poly[i + 1], bx = poly[j], by = poly[j + 1]
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside
  }
  return poly.length >= 6 && inside
}

function setAccept(next) {
  if (next === accept) return
  accept = next
  bridge?.setAccept(next)
}

// 点击穿透时也能收到转发的 mousemove，从里面读 Option 键
for (const type of ['mousemove', 'mousedown', 'mouseup']) {
  document.addEventListener(type, (e) => (altKey = e.altKey), true)
}
document.addEventListener('keydown', (e) => (altKey = e.altKey), true)
document.addEventListener('keyup', (e) => (altKey = e.altKey), true)

// 和原版一样：轮询光标位置，决定接不接收鼠标、要不要进入 Option 状态
setInterval(() => {
  if (!bridge) return
  const p = bridge.cursor()
  const x = p.x - originX
  const y = p.y - originY
  const hit = inPolygon(x, y)
  const want = altKey && (optionDown || dragging || hit)
  if (want !== optionDown) {
    optionDown = want
    window.rugSetOption?.(want)
  }
  setAccept(dragging || hit)
}, 33)

// 渲染保活：和晾衣绳一样，透明窗口长时间不重绘时后续变化可能画不出来
if (params.get('anchor') === '1') {
  const dot = document.createElement('div')
  Object.assign(dot.style, { position: 'fixed', right: '0', bottom: '0', width: '1px', height: '1px', background: '#808080', opacity: '0.5', pointerEvents: 'none' })
  document.body.appendChild(dot)
  let on = false
  setInterval(() => {
    on = !on
    dot.style.opacity = on ? '0.51' : '0.5'
  }, 500)
}

await import('./vendor/rug.js')
bridge?.log('rug-ready')
