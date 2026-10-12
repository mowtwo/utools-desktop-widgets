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
            // 不在每次拖完时把窗口推回最底层：Electron 在 macOS 上是先隐藏再放到底层，会闪一下
            dragging = !!m.active
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

// 不加渲染保活点：全屏的 WebGL 透明窗口每次重绘都要整窗重新合成，周期性地改动会造成闪烁

await import('./vendor/rug.js')
bridge?.log('rug-ready')
