// 桌面地毯窗口的宿主层：替代 desktop-rug 原生（Swift）部分
// - 垫一个 window.webkit.messageHandlers.rug，让移植来的 rug.js 不用改通信代码
// - 按 rug.js 报来的地毯轮廓切换点击穿透：鼠标在地毯上就接收（随时可以直接拖、掀、折），其余点击落到桌面
// - 编辑模式：地毯浮到最上层，屏幕上方放一条工具栏：调整大小 / 旋转、换花样、摊平、复位、完成
//   （原版靠按住 Option 进入缩放旋转，悬浮窗口拿不到可靠的按键状态，改成按钮切换）

const bridge = window.rugBridge
const params = new URLSearchParams(location.search)
const originX = Number(params.get('bx') || 0)
const originY = Number(params.get('by') || 0)
const MATERIALS = ['persian', 'warp', 'grain', 'mesh', 'dots']

let poly = []
let dragging = false
let accept = false
let editing = false
let transform = false
let material = params.get('material') || 'persian'

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
            break
          case 'material':
            material = m.id
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
  bridge?.log('accept', next)
  bridge?.setAccept(next)
}

// 排查「编辑后卡住」：可见性变化，以及进出编辑后几秒内的出帧情况
document.addEventListener('visibilitychange', () => bridge?.log('visibility', document.visibilityState))
function probeFrames(label) {
  let frames = 0
  const t0 = performance.now()
  const count = () => {
    frames++
    if (performance.now() - t0 < 1000) requestAnimationFrame(count)
  }
  requestAnimationFrame(count)
  setTimeout(() => {
    const state = window.rugState?.()
    bridge?.log('frames', { label, raf: frames, visibility: document.visibilityState, phase: state?.phase, focus: document.hasFocus() })
  }, 1200)
}

// ---------- 编辑工具栏 ----------

const toolbar = document.createElement('div')
Object.assign(toolbar.style, {
  position: 'fixed', top: '56px', left: '50%', transform: 'translateX(-50%)', display: 'none', gap: '4px', padding: '5px',
  borderRadius: '14px', background: 'rgba(28,28,30,0.88)', boxShadow: '0 8px 28px rgba(0,0,0,0.35)', zIndex: '10',
  font: '500 13px -apple-system, "PingFang SC", sans-serif', color: '#fff', userSelect: 'none', alignItems: 'center',
})
const button = (label, onClick, primary = false) => {
  const b = document.createElement('button')
  b.textContent = label
  Object.assign(b.style, {
    border: '0', borderRadius: '9px', padding: '6px 12px', font: 'inherit', cursor: 'pointer',
    background: primary ? '#0a84ff' : 'transparent', color: '#fff',
  })
  b.addEventListener('mouseenter', () => { if (!primary && b.dataset.on !== '1') b.style.background = 'rgba(255,255,255,0.12)' })
  b.addEventListener('mouseleave', () => { if (!primary && b.dataset.on !== '1') b.style.background = 'transparent' })
  b.addEventListener('click', (e) => {
    e.stopPropagation()
    onClick(b)
  })
  toolbar.appendChild(b)
  return b
}
const hint = document.createElement('span')
hint.textContent = '编辑地毯：拖动摆放，拉边角掀开或对折'
Object.assign(hint.style, { padding: '0 10px 0 6px', color: 'rgba(255,255,255,0.65)', fontSize: '12px' })
toolbar.appendChild(hint)
const setTransform = (on, b) => {
  transform = on
  window.rugSetOption?.(on)
  b.dataset.on = on ? '1' : '0'
  b.style.background = on ? 'rgba(255,255,255,0.22)' : 'transparent'
}
const transformBtn = button('调整大小 / 旋转', (b) => setTransform(!transform, b))
button('换花样', () => {
  const next = MATERIALS[(MATERIALS.indexOf(material) + 1) % MATERIALS.length]
  window.rugSetMaterial?.(next)
})
button('摊平', () => window.rugFlatten?.())
button('复位', () => window.rugReset?.())
button('完成', () => bridge?.endEdit(), true)
document.body.appendChild(toolbar)

function overToolbar(x, y) {
  if (toolbar.style.display === 'none') return false
  const r = toolbar.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

bridge?.onEdit((on) => {
  editing = on
  probeFrames(on ? 'edit-on' : 'edit-off')
  setTimeout(() => probeFrames(on ? 'edit-on+3s' : 'edit-off+3s'), 3000)
  toolbar.style.display = on ? 'flex' : 'none'
  if (!on && transform) setTransform(false, transformBtn)
})

// 轮询光标：在地毯上（编辑时还有工具栏）就接收鼠标，其余点击穿透
setInterval(() => {
  if (!bridge) return
  const p = bridge.cursor()
  // 插件重启的那一刻地毯窗口还在，可能拿不到光标位置
  if (!p) return
  const x = p.x - originX
  const y = p.y - originY
  setAccept(dragging || inPolygon(x, y) || overToolbar(x, y))
}, 33)

// 地毯本体的 WebGL 上下文丢了（地毯变黑、渲染停住）：记下来并重新加载页面恢复
document.addEventListener(
  'webglcontextlost',
  (e) => {
    const main = e.target === document.querySelector('body > canvas')
    bridge?.log('context-lost', { main })
    if (main) setTimeout(() => location.reload(), 300)
  },
  true,
)

// 不加渲染保活点：全屏的 WebGL 透明窗口每次重绘都要整窗重新合成，周期性地改动会造成闪烁

// 排查「点击到了窗口，地毯却不拖动」：记录按下 / 松开时 rug.js 的状态
for (const type of ['pointerdown', 'pointerup']) {
  document.addEventListener(
    type,
    (e) => {
      setTimeout(() => bridge?.log(type, { x: Math.round(e.clientX), y: Math.round(e.clientY), editing, phase: window.rugState?.()?.phase }), 0)
    },
    true,
  )
}

await import('./vendor/rug.js')
// eslint-disable-next-line no-undef
bridge?.log('rug-ready', { build: typeof __BUILD_TIME__ === 'string' ? __BUILD_TIME__ : 'dev' })
bridge?.ready()
