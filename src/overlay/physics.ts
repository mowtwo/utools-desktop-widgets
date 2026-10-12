// 晾衣绳的物理：有张力的弦（重力 + 挂件重量）和每件挂件的单摆
// 绳节只在竖直方向运动：下垂量由张力精确决定，拖动挂件时重量移动，绳子随之起伏

import { ROPE_TOP, sag } from './layout'

const SEGMENTS = 48
/** 重力加速度（px/s²） */
const GRAVITY = 2200
/** 速度衰减（1/s），越大停得越快 */
const DAMPING = 2.6
/** 积分小步的最大时长（s）：张力很大，步长超过约 6ms 就会数值发散 */
const MAX_SUBSTEP = 0.004
/** 绳子两端在屏幕外多远 */
const OVERHANG = 20

export interface Load {
  x: number
  /** 挂件的重量（相对一个绳节） */
  weight: number
}

export class Rope {
  xs = new Float64Array(SEGMENTS + 1)
  ys = new Float64Array(SEGMENTS + 1)
  private vys = new Float64Array(SEGMENTS + 1)
  private mass = new Float64Array(SEGMENTS + 1)
  /** 张力（按绳节单位） */
  private tension = 0
  width = 0

  constructor(width: number) {
    this.width = width
    const left = -OVERHANG
    const span = width + OVERHANG * 2
    for (let i = 0; i <= SEGMENTS; i++) {
      this.xs[i] = left + (span * i) / SEGMENTS
      this.ys[i] = ROPE_TOP
    }
    // 空绳子的静止形状是抛物线：sag = g·N² / (8·T)
    this.tension = (GRAVITY * SEGMENTS * SEGMENTS) / (8 * sag(width))
    // 从静止形状开始，避免一出现就猛地掉下来
    for (let i = 0; i <= SEGMENTS; i++) {
      const f = i / SEGMENTS
      this.ys[i] = ROPE_TOP + 4 * sag(width) * f * (1 - f)
    }
  }

  step(dt: number, loads: Load[]) {
    this.mass.fill(1)
    for (const load of loads) {
      const { i, t } = this.locate(load.x)
      this.mass[i] += load.weight * (1 - t)
      this.mass[i + 1] += load.weight * t
    }
    const substeps = Math.ceil(dt / MAX_SUBSTEP)
    const h = dt / substeps
    const decay = Math.exp(-DAMPING * h)
    for (let s = 0; s < substeps; s++) {
      // 半隐式欧拉：先更新速度再更新位置；两端固定
      for (let i = 1; i < SEGMENTS; i++) {
        const pull = this.tension * (this.ys[i - 1] - 2 * this.ys[i] + this.ys[i + 1])
        const acc = pull / this.mass[i] + GRAVITY
        this.vys[i] = (this.vys[i] + acc * h) * decay
      }
      for (let i = 1; i < SEGMENTS; i++) this.ys[i] += this.vys[i] * h
    }
  }

  /** x 落在哪一段、段内比例 */
  private locate(x: number) {
    const span = this.xs[1] - this.xs[0]
    const f = Math.min(SEGMENTS - 1e-6, Math.max(0, (x - this.xs[0]) / span))
    const i = Math.floor(f)
    return { i, t: f - i }
  }

  yAt(x: number) {
    const { i, t } = this.locate(x)
    return this.ys[i] + (this.ys[i + 1] - this.ys[i]) * t
  }

  /** 在 x 处给绳子一个向下的速度（px/s），挂上东西时弹一下 */
  pluck(x: number, velocity: number) {
    const { i, t } = this.locate(x)
    if (i > 0) this.vys[i] += velocity * (1 - t)
    if (i + 1 < SEGMENTS) this.vys[i + 1] += velocity * t
  }

  /** 最快一节的速度（px/s），用来判断是否已经静止 */
  motion() {
    let max = 0
    for (let i = 1; i < SEGMENTS; i++) max = Math.max(max, Math.abs(this.vys[i]))
    return max
  }
}

/** 挂件绕夹子摆动的单摆，角度单位为弧度 */
export class Pendulum {
  angle = 0
  velocity = 0
  private lastX: number | null = null
  private lastY = 0
  private lastVx = 0
  private lastVy = 0

  /** 摆长（px）：从夹子到挂件重心 */
  private length = 70

  /** 跟随挂点运动：挂点的加速度会把挂件甩起来 */
  step(dt: number, x: number, y: number) {
    if (this.lastX === null) {
      this.lastX = x
      this.lastY = y
    }
    const vx = (x - this.lastX) / dt
    const vy = (y - this.lastY) / dt
    const ax = Math.max(-8000, Math.min(8000, (vx - this.lastVx) / dt))
    const ay = Math.max(-8000, Math.min(8000, (vy - this.lastVy) / dt))
    this.lastX = x
    this.lastY = y
    this.lastVx = vx
    this.lastVy = vy
    // angle 与 CSS rotate 同向（顺时针为正，挂件摆向左）；挂点向右加速时挂件落后、往左摆
    // 屏幕 y 轴向下：挂点向下加速时等效重力变小
    const g = GRAVITY - ay
    const acc = (-g * Math.sin(this.angle) + ax * Math.cos(this.angle)) / this.length - 2.2 * this.velocity
    this.velocity += acc * dt
    this.angle += this.velocity * dt
  }

  kick(radiansPerSecond: number) {
    this.velocity += radiansPerSecond
  }

  isResting() {
    return Math.abs(this.angle) < 0.002 && Math.abs(this.velocity) < 0.01
  }
}
