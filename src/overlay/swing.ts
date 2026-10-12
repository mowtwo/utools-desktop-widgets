/** 阻尼摆动的关键帧：从 amplitude 度开始来回摆，逐渐停到 base 度 */
function dampedFrames(base: number, amplitude: number, duration: number) {
  const frames: Keyframe[] = []
  const steps = 32
  const omega = 2 * Math.PI * 1.3
  const decay = 3.2
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (duration / 1000)
    const angle = base + amplitude * Math.exp(-decay * t) * Math.cos(omega * t)
    frames.push({ rotate: `${angle.toFixed(2)}deg`, offset: i / steps })
  }
  return frames
}

/** 挂上去：从上方落下，再晃几下 */
export function arrive(el: HTMLElement, tilt: number) {
  el.animate([{ translate: '0 -46px', opacity: 0 }, { translate: '0 0', opacity: 1 }], {
    duration: 420,
    easing: 'cubic-bezier(.34,1.4,.64,1)',
  })
  el.animate(dampedFrames(tilt, 16, 1800), { duration: 1800 })
}

/** 被风吹 / 被碰了一下 */
export function nudge(el: HTMLElement, tilt: number, degrees: number, delay = 0) {
  el.animate(dampedFrames(tilt, degrees, 1400), { duration: 1400, delay })
}
