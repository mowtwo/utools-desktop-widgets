// 挂件 API 的唯一定义：编辑器补全 / 悬停提示、类型声明、人看的说明、给 AI 的 skill 文档都从这里生成

import { DATA_MAX, HANDLE_TEXT_MAX, TREE_MAX_DEPTH, TREE_MAX_NODES, WIDGET_DEFAULT, WIDGET_MAX, WIDGET_MIN } from './protocol'

export interface ApiMember {
  /** 完整路径，如 ctx.line.focus */
  path: string
  signature: string
  doc: string
}

export interface PropSpec {
  name: string
  /** TypeScript 风格的类型，用于类型声明和提示 */
  type: string
  /** 可选的字面量取值，用于补全 */
  values?: string[]
  doc: string
}

export interface ElementSpec {
  name: string
  signature: string
  doc: string
  props: PropSpec[]
}

const COLOR_DOC = "主题色 'fg' | 'muted' | 'primary' | 'accent' | 'danger' | 'success' | 'warning'，或十六进制如 '#ff6600'"
const COLOR_VALUES = ['fg', 'muted', 'primary', 'accent', 'danger', 'success', 'warning']

export const ENTRY: ApiMember = {
  path: 'defineWidget',
  signature: 'defineWidget((ctx) => (state) => UINode)',
  doc: '挂件的唯一入口。入口函数只在启动时调用一次，用来初始化、注册定时器；必须返回一个渲染函数，状态变了就会重新调用它',
}

export const CTX_MEMBERS: ApiMember[] = [
  { path: 'ctx.state', signature: 'ctx.state: Record<string, any>', doc: '挂件的状态对象，渲染函数的参数就是它' },
  { path: 'ctx.setState', signature: 'ctx.setState(patch | (state) => patch)', doc: '合并状态并重新渲染；同一轮里多次调用只渲染一次' },
  { path: 'ctx.update', signature: 'ctx.update()', doc: '不改状态，直接重新渲染（比如时钟每秒刷新）' },
  { path: 'ctx.every', signature: 'ctx.every(ms, fn): () => void', doc: '每隔 ms 毫秒执行一次 fn（最短 200ms），返回取消函数' },
  { path: 'ctx.settings', signature: 'ctx.settings: Record<string, any>', doc: '编辑器「设置」里写的 JSON，只读' },
  { path: 'ctx.storage', signature: 'ctx.storage', doc: '每个挂件实例自己的持久化数据，重启后还在' },
  { path: 'ctx.storage.get', signature: 'ctx.storage.get(key): any', doc: '读取一项数据' },
  {
    path: 'ctx.storage.set',
    signature: 'ctx.storage.set(key, value)',
    doc: `保存一项数据（要能转成 JSON，全部加起来不超过 ${DATA_MAX / 1024}KB）`,
  },
  {
    path: 'ctx.size',
    signature: 'ctx.size(width, height)',
    doc: `调整挂件尺寸（px）。宽 ${WIDGET_MIN.width}~${WIDGET_MAX.width}，高 ${WIDGET_MIN.height}~${WIDGET_MAX.height}，超出会被夹住，内容超出尺寸会被裁掉`,
  },
  { path: 'ctx.copy', signature: 'ctx.copy(text)', doc: '复制文本到剪贴板（0.5 秒最多一次）' },
  { path: 'ctx.open', signature: 'ctx.open(url)', doc: '用浏览器打开 http / https 链接（2 秒最多一次）' },
  { path: 'ctx.notify', signature: 'ctx.notify(text)', doc: '发一条系统通知（5 秒最多一次）' },
  { path: 'ctx.theme', signature: "ctx.theme: 'light' | 'dark'", doc: '当前主题' },
  { path: 'ctx.onTheme', signature: 'ctx.onTheme(fn)', doc: '主题变化时回调（之后会自动重新渲染）' },
  { path: 'ctx.line', signature: 'ctx.line', doc: '控制晾衣绳' },
  { path: 'ctx.line.focus', signature: 'ctx.line.focus(on = true)', doc: '专注：隐藏绳上其他东西，只留这个挂件' },
  { path: 'ctx.line.keepOpen', signature: 'ctx.line.keepOpen(on = true)', doc: '不让晾衣绳自动收起' },
  { path: 'ctx.line.collapse', signature: 'ctx.line.collapse()', doc: '立刻收起晾衣绳（常驻模式下无效）' },
  { path: 'ctx.line.reveal', signature: 'ctx.line.reveal()', doc: '弹出晾衣绳 5 秒（10 秒最多一次）' },
  { path: 'ctx.handle', signature: 'ctx.handle', doc: '晾衣绳收起时，屏幕顶部的小把手' },
  {
    path: 'ctx.handle.set',
    signature: 'ctx.handle.set({ text?, progress? })',
    doc: `在小把手上显示文字（最多 ${HANDLE_TEXT_MAX} 个字）和进度（0~1）；同一时间只有一个挂件能占用`,
  },
  { path: 'ctx.handle.clear', signature: 'ctx.handle.clear()', doc: '把小把手还原' },
]

const BOX_PROPS: PropSpec[] = [
  { name: 'direction', type: "'row' | 'column'", values: ['row', 'column'], doc: '排列方向，默认 column' },
  { name: 'gap', type: 'number', doc: '子元素间距 0~24' },
  { name: 'padding', type: 'number', doc: '内边距 0~24' },
  { name: 'align', type: "'start' | 'center' | 'end' | 'stretch'", values: ['start', 'center', 'end', 'stretch'], doc: '交叉轴对齐' },
  { name: 'justify', type: "'start' | 'center' | 'end' | 'between'", values: ['start', 'center', 'end', 'between'], doc: '主轴对齐' },
  { name: 'background', type: 'Color', values: COLOR_VALUES, doc: `背景色，默认透明。${COLOR_DOC}` },
  { name: 'radius', type: 'number', doc: '圆角 0~16' },
  { name: 'grow', type: 'boolean', doc: '占满剩余空间' },
  { name: 'wrap', type: 'boolean', doc: '放不下时换行' },
  { name: 'width', type: 'number', doc: '固定宽度（px）' },
  { name: 'height', type: 'number', doc: '固定高度（px）' },
]

export const UI_ELEMENTS: ElementSpec[] = [
  { name: 'box', signature: 'ui.box(props?, children?)', doc: '透明背景的容器', props: BOX_PROPS },
  { name: 'row', signature: 'ui.row(props?, children?)', doc: '横排容器（box 的简写，默认垂直居中）', props: BOX_PROPS },
  { name: 'column', signature: 'ui.column(props?, children?)', doc: '竖排容器（box 的简写）', props: BOX_PROPS },
  {
    name: 'text',
    signature: 'ui.text(content, props?)',
    doc: '一段文字',
    props: [
      { name: 'size', type: "'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'", values: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'], doc: '字号，默认 sm' },
      { name: 'weight', type: "'normal' | 'medium' | 'bold'", values: ['normal', 'medium', 'bold'], doc: '粗细' },
      { name: 'color', type: 'Color', values: COLOR_VALUES, doc: COLOR_DOC },
      { name: 'mono', type: 'boolean', doc: '等宽数字（适合时间、计数）' },
      { name: 'align', type: "'start' | 'center' | 'end'", values: ['start', 'center', 'end'], doc: '文字对齐' },
      { name: 'lines', type: 'number', doc: '最多显示几行（1~6，默认 3），超出省略' },
      { name: 'strike', type: 'boolean', doc: '删除线' },
    ],
  },
  {
    name: 'image',
    signature: 'ui.image(src, props?)',
    doc: '图片，src 只能是 https 链接或 data:image/… 的 Data URL',
    props: [
      { name: 'width', type: 'number', doc: '宽（px），默认 48' },
      { name: 'height', type: 'number', doc: '高（px），默认 48' },
      { name: 'fit', type: "'cover' | 'contain'", values: ['cover', 'contain'], doc: '缩放方式' },
      { name: 'radius', type: 'number', doc: '圆角 0~16' },
    ],
  },
  {
    name: 'button',
    signature: 'ui.button(label, props?)',
    doc: '按钮',
    props: [
      { name: 'onClick', type: '() => void', doc: '点击回调' },
      { name: 'variant', type: "'primary' | 'secondary' | 'ghost'", values: ['primary', 'secondary', 'ghost'], doc: '样式，默认 secondary' },
      { name: 'size', type: "'sm' | 'md'", values: ['sm', 'md'], doc: '大小，默认 sm' },
      { name: 'disabled', type: 'boolean', doc: '禁用' },
    ],
  },
  {
    name: 'progress',
    signature: 'ui.progress(value, props?)',
    doc: '进度条，value 取 0~1',
    props: [
      { name: 'color', type: 'Color', values: COLOR_VALUES, doc: COLOR_DOC },
      { name: 'height', type: 'number', doc: '粗细 2~12，默认 4' },
    ],
  },
  { name: 'spacer', signature: 'ui.spacer(size?)', doc: '空白：不给 size 就占满剩余空间', props: [] },
]

export const RULES = [
  '脚本只能调用 defineWidget 注册入口，界面只能用 ui.* 元素拼出来；不能写 HTML、不能访问 DOM（document、window 都没有）',
  '渲染函数要是纯函数：只根据 state、settings 返回元素，副作用（定时器、存储）放在入口函数或回调里',
  `元素最多 ${TREE_MAX_NODES} 个、嵌套最多 ${TREE_MAX_DEPTH} 层；子元素数组里的 null / false 会被忽略，可以用来条件渲染`,
  `挂件默认尺寸 ${WIDGET_DEFAULT.width}×${WIDGET_DEFAULT.height}，在扩展的「宽 / 高」里改，或用 ctx.size；内容超出尺寸会被裁掉`,
  '脚本跑在独立线程里，死循环或 3 秒没有响应会被自动停止；可以用 fetch 请求允许跨域的 https 接口',
  '不认识的元素、属性和取值会被宿主丢掉，不会报错，所以写错属性名时要留意效果',
]

// ---------- 类型声明 ----------

/** 编辑器里展示的类型声明（d.ts 风格） */
export function typeDeclarations() {
  const lines: string[] = []
  lines.push("type Color = 'fg' | 'muted' | 'primary' | 'accent' | 'danger' | 'success' | 'warning' | `#${string}`")
  lines.push('type UINode = { readonly __ui: true }')
  lines.push('type Child = UINode | string | number | null | false')
  lines.push('')
  const propsName = (el: ElementSpec) => `${el.name[0].toUpperCase()}${el.name.slice(1)}Props`
  for (const el of UI_ELEMENTS) {
    if (!el.props.length || (el.name !== 'box' && el.props === BOX_PROPS)) continue
    lines.push(`interface ${propsName(el)} {`)
    for (const p of el.props) lines.push(`  /** ${p.doc} */\n  ${p.name}?: ${p.type}`)
    lines.push('}')
  }
  lines.push('')
  lines.push('declare const ui: {')
  for (const el of UI_ELEMENTS) {
    const props = el.props === BOX_PROPS ? 'BoxProps' : el.props.length ? propsName(el) : null
    const first = el.signature.match(/\((\w+)/)?.[1]
    const args =
      first === 'props'
        ? `props?: ${props}, children?: Child[]`
        : first === 'size'
          ? 'size?: number'
          : `${first}: ${first === 'value' ? 'number' : 'string'}${props ? `, props?: ${props}` : ''}`
    lines.push(`  /** ${el.doc} */\n  ${el.name}(${args}): UINode`)
  }
  lines.push('}')
  lines.push('')
  lines.push('interface WidgetContext {')
  for (const m of CTX_MEMBERS) {
    if (m.path.split('.').length > 2) continue
    lines.push(`  /** ${m.doc} */\n  ${m.signature.replace(/^ctx\./, '')}`)
  }
  lines.push('}')
  lines.push('')
  lines.push(`/** ${ENTRY.doc} */`)
  lines.push('declare function defineWidget(setup: (ctx: WidgetContext) => (state: Record<string, any>) => UINode): void')
  return lines.join('\n')
}

// ---------- 给 AI 的 skill 文档 ----------

/** 作为 system 提示词交给 uTools AI：怎么写一个晾衣绳挂件 */
export function aiSkill(examples: { name: string; code: string; settings: string }[]) {
  const ctx = CTX_MEMBERS.map((m) => `- \`${m.signature}\`：${m.doc}`).join('\n')
  const ui = UI_ELEMENTS.map((el) => {
    const props = el.props.map((p) => `  - \`${p.name}: ${p.type}\`：${p.doc}`).join('\n')
    return `- \`${el.signature}\`：${el.doc}${props ? '\n' + props : ''}`
  }).join('\n')
  const demo = examples
    .map((e) => `### 示例：${e.name}\n\n设置：\n\`\`\`json\n${e.settings}\n\`\`\`\n\n代码：\n\`\`\`js\n${e.code.trim()}\n\`\`\``)
    .join('\n\n')
  return `你是「晾衣绳」桌面挂件的开发助手。用户会描述想要的挂件，或给出现有代码让你修改，你要写出能直接运行的挂件脚本。

## 运行环境

挂件挂在屏幕顶部的一根晾衣绳上，是一张小卡片。脚本在沙箱线程里运行，只能用下面列出的 API。

## 规则

${RULES.map((r) => `- ${r}`).join('\n')}

## 入口

- \`${ENTRY.signature}\`：${ENTRY.doc}

## ctx（入口函数的参数）

${ctx}

## ui（界面元素，全局可用）

${ui}

${demo}

## 回复格式

先用一两句话说明你做了什么，然后严格按下面的格式给出结果（三部分都要有，不要输出别的代码块）：

名称：<挂件名称，10 个字以内>
尺寸：<宽>x<高>

\`\`\`json
<设置的 JSON，没有设置就写 {}>
\`\`\`

\`\`\`js
<完整的挂件脚本>
\`\`\`
`
}

/** 解析 AI 回复里的名称、尺寸、设置和代码 */
export function parseAiReply(text: string) {
  const name = /名称[:：]\s*(.+)/.exec(text)?.[1]?.trim()
  const size = /尺寸[:：]\s*(\d+)\s*[x×*]\s*(\d+)/.exec(text)
  const json = /```json\s*\n([\s\S]*?)```/.exec(text)?.[1]?.trim()
  const code = /```(?:js|javascript)\s*\n([\s\S]*?)```/.exec(text)?.[1]
  return {
    name: name ? name.slice(0, 20) : undefined,
    width: size ? Number(size[1]) : undefined,
    height: size ? Number(size[2]) : undefined,
    settings: json,
    code: code ? code.replace(/\s+$/, '\n') : undefined,
  }
}
