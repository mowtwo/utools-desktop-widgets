// 拉绳的自动分组：按类型分，文件再按种类细分；只列出绳上真有东西的组
import type { LineItem } from '@/types/line'

export interface AutoGroup {
  key: string
  label: string
  count: number
}

export const ALL = 'all'

/** 组的顺序和名字 */
const GROUPS: Array<[key: string, label: string]> = [
  ['image', '图片'],
  ['note', '便签'],
  ['link', '链接'],
  ['folder', '文件夹'],
  ['doc', '文档'],
  ['code', '代码'],
  ['archive', '压缩包'],
  ['media', '音视频'],
  ['app', '应用'],
  ['file', '其他文件'],
  ['todo', '待办'],
  ['widget', '挂件'],
]

const EXT_GROUPS: Record<string, string[]> = {
  doc: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'csv', 'pages', 'numbers', 'key', 'epub', 'odt', 'ods', 'odp'],
  code: ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'rb', 'php', 'sh', 'zsh', 'ps1', 'bat', 'sql', 'json', 'yaml', 'yml', 'toml', 'xml', 'html', 'css', 'scss', 'vue', 'svelte', 'lua', 'dart'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2', 'xz', 'zst', 'dmg', 'iso', 'upx', 'asar'],
  media: ['mp3', 'wav', 'flac', 'm4a', 'aac', 'ogg', 'opus', 'mp4', 'mov', 'mkv', 'avi', 'webm', 'm4v', 'flv', 'wmv'],
  app: ['app', 'exe', 'msi', 'pkg', 'apk', 'ipa', 'appimage', 'deb', 'rpm', 'lnk'],
}
const BY_EXT = new Map(Object.entries(EXT_GROUPS).flatMap(([g, exts]) => exts.map((e) => [e, g] as const)))

const URL_RE = /^https?:\/\/\S+$/i

/** 一件东西属于哪个组；空夹子不属于任何组，只在「全部」里出现 */
export function groupOf(it: LineItem): string | null {
  switch (it.type) {
    case 'clip':
      return null
    case 'note':
      return URL_RE.test(it.text.trim()) ? 'link' : 'note'
    case 'file': {
      if (it.isDirectory) return 'folder'
      // 图片文件显示的就是图片，和截图放一组
      if (it.src) return 'image'
      const ext = /\.([^./\\]+)$/.exec(it.name)?.[1]?.toLowerCase() ?? ''
      return BY_EXT.get(ext) ?? 'file'
    }
    default:
      return it.type
  }
}

export const inGroup = (group: string, it: LineItem) => group === ALL || groupOf(it) === group

/** 绳上现有的组（不含「全部」），按固定顺序 */
export function groupsOf(items: LineItem[]): AutoGroup[] {
  const counts = new Map<string, number>()
  for (const it of items) {
    const g = groupOf(it)
    if (g) counts.set(g, (counts.get(g) ?? 0) + 1)
  }
  return GROUPS.filter(([key]) => counts.has(key)).map(([key, label]) => ({ key, label, count: counts.get(key)! }))
}
