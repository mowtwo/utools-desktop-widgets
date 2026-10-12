// 移植自 lolPing（https://github.com/darrenprx/lolPing，MIT，Copyright (c) 2026 Danrui Meng），见 NOTICE。
// 改动：去掉联机房间的名字标签。

import { FALLBACK_TEXTURE, textureUrl, type PingDef } from './pings'

/** 屏幕上最多同时有多少个信号，超出就先移除最早的 */
export const MAX_PINGS = 60

export interface PingFxOptions {
  sizePx: number
  durationS: number
}

function img(name: string, cls = ''): HTMLImageElement {
  const el = document.createElement('img')
  if (cls) el.className = cls
  el.src = textureUrl(name)
  el.onerror = () => {
    el.onerror = null
    el.src = textureUrl(FALLBACK_TEXTURE)
  }
  return el
}

const div = (cls: string): HTMLDivElement => {
  const d = document.createElement('div')
  d.className = cls
  return d
}

/** 在 (x, y) 放一个带动画的信号，动画结束后移除 */
export function spawnPing(layer: HTMLElement, def: PingDef, x: number, y: number, opts: PingFxOptions): void {
  const root = div('ping')
  root.style.left = `${x}px`
  root.style.top = `${y}px`
  root.style.setProperty('--c', def.color)
  root.style.setProperty('--size', `${opts.sizePx}px`)
  root.style.setProperty('--dur', `${opts.durationS}s`)
  root.append(div('ground'), div('ring'), div('ring r2'), div('ring r3'))

  const art = div('art')
  if (def.art.length === 2) {
    const clash = div('clash')
    clash.append(img(def.art[0], 'a1'), img(def.art[1], 'a2'))
    art.append(clash, div('flash'))
  } else {
    const pop = div('pop')
    pop.append(img(def.art[0]))
    art.append(pop)
  }
  root.append(art)
  while (layer.childElementCount >= MAX_PINGS) layer.firstElementChild?.remove()
  layer.append(root)
  // 不等动画事件：悬浮层被判定为不可见时动画不推进
  setTimeout(() => root.remove(), opts.durationS * 1000 + 150)
}
