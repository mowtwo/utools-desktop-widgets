// 信号定义改写自 lolPing 的 src/shared/pings.ts（MIT）；名称换成中文，素材路径指向 public/lol
// 图标和音效 © Riot Games，依据 Riot Games 的「Legal Jibber Jabber」政策用于免费非商业项目，不在本项目 MIT 许可内

export type PingId =
  | 'danger' | 'push' | 'omw' | 'allin' | 'assist' | 'needvision' | 'missing' | 'enemyvision' | 'generic'
  | 'bait' | 'visioncleared'

export interface PingDef {
  id: PingId
  name: string
  /** 轮盘扇区上的图标：public/lol/textures 下的文件名 */
  icon: string
  /** 落点显示的图案；两张是「全力进攻」撞在一起的两半 */
  art: string[]
  /** public/lol/sounds 下的音效 */
  sound: string
  /** 光圈和光晕的颜色 */
  color: string
}

export const ALL_PINGS: readonly PingDef[] = [
  { id: 'danger', name: '危险', icon: 'pingwheel_retreatrender', art: ['pingwheel_retreatrender'], sound: 'SRP_12', color: '#ff3b55' },
  { id: 'push', name: '推进', icon: 'push', art: ['pingwheel_pushrender'], sound: 'SRP_9', color: '#35d27a' },
  { id: 'omw', name: '正在赶来', icon: 'omw', art: ['omw'], sound: 'OnMyWay', color: '#2e8bff' },
  { id: 'allin', name: '全力进攻', icon: 'all_in', art: ['pingwheel_allin_render_01', 'pingwheel_allin_render_02'], sound: 'SRP_4', color: '#f2b320' },
  { id: 'assist', name: '请求协助', icon: 'assist_me', art: ['assist_me'], sound: 'ComeHere', color: '#56d43c' },
  { id: 'needvision', name: '需要视野', icon: 'need_vision', art: ['need_vision'], sound: 'SRP_7', color: '#56d43c' },
  { id: 'missing', name: '敌人消失', icon: 'enemy_missing', art: ['enemy_missing'], sound: 'MIA', color: '#f2c518' },
  { id: 'enemyvision', name: '敌方视野', icon: 'enemy_vision', art: ['pingwheel_enemyvisionrender'], sound: 'AreaIsWarded', color: '#ff3b55' },
  { id: 'generic', name: '普通信号', icon: 'generic_ping', art: ['pingwheel_basicpingrender'], sound: 'Base', color: '#2e8bff' },
  { id: 'bait', name: '诱饵', icon: 'pingwheel_baitrender', art: ['pingwheel_baitrender'], sound: 'SRP_11', color: '#efbc12' },
  { id: 'visioncleared', name: '视野已清除', icon: 'vision_cleared', art: ['pingwheel_visionclearedrender'], sound: 'SRP_6', color: '#2b80ff' },
]

/** 游戏里的默认轮盘：从正上方开始顺时针 */
export const DEFAULT_LOL_WHEEL: readonly PingId[] = ['danger', 'push', 'omw', 'allin', 'assist', 'needvision', 'missing', 'enemyvision']
export const WHEEL_SLOTS = 8
export const TICK_SOUND = 'button'
export const FALLBACK_TEXTURE = 'generic_ping'

export const pingById = (id: string): PingDef => ALL_PINGS.find((p) => p.id === id) ?? ALL_PINGS[8]

export const textureUrl = (name: string) => `lol/textures/${name}.png`
export const soundUrl = (name: string) => `lol/sounds/${name}.ogg`

export const allSoundNames = () => [...new Set([...ALL_PINGS.map((p) => p.sound), TICK_SOUND])]
