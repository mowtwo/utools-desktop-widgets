import type { WidgetExtension } from './protocol'

/** 新建扩展时的模板 */
export const TEMPLATE: Omit<WidgetExtension, 'id'> = {
  name: '新挂件',
  width: 136,
  height: 64,
  settings: '{\n  "text": "你好"\n}',
  code: `// 入口函数只在启动时调用一次，返回的渲染函数在状态变化时重新调用
defineWidget((ctx) => {
  ctx.setState({ count: 0 })

  return (state) =>
    ui.column({ align: 'center', justify: 'center', gap: 4 }, [
      ui.text(ctx.settings.text, { size: 'lg', weight: 'bold' }),
      ui.button('点了 ' + state.count + ' 次', {
        onClick: () => ctx.setState({ count: state.count + 1 }),
      }),
    ])
})
`,
}
