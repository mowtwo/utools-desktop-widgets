// 构建后写 dist/whatevertools.json：给 whatevertools 兼容层（独立打包）用的身份、权限说明和独立应用配置。
// uTools 不读这个文件，plugin.json 也不需要改，不影响 uTools 的打包和发布。
import fs from 'node:fs'

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const meta = {
  id: 'desktop-widgets',
  name: '桌面晾衣绳',
  version: pkg.version,
  description: pkg.description,
  homepage: 'https://github.com/mowtwo/utools-desktop-widgets',
  // 用途说明会显示在权限询问里
  permissions: {
    'window.create': { reason: '晾衣绳悬浮层和桌面地毯是独立窗口' },
    'window.overlay': { reason: '悬浮层要置顶、透明并让鼠标穿透（只有挂着的东西能点）' },
    'screen.read': { reason: '按显示器摆放晾衣绳，判断鼠标是否顶到屏幕边缘' },
    'screen.capture': { reason: '「截图挂到晾衣绳」和发信号时截一块图' },
    'clipboard.read': { reason: '把剪贴板里的图片、文字挂到晾衣绳' },
    'clipboard.write': { reason: '单击便签复制文字、复制挂着的图片' },
    'fs.read': { reason: '显示和拖出挂在绳上的文件' },
    'shell.open': { reason: '用访达 / 资源管理器打开挂着的文件和文件夹' },
    'input.drag': { reason: '把挂着的东西拖到别的应用里' },
    notification: { reason: '截图、挂件出错时提醒' },
    schedule: { reason: '「保持显示」：插件被结束后自动拉起悬浮层' },
    ai: { reason: '用 AI 生成挂件扩展' },
    mcp: { reason: '让 AI Agent 挂东西、操作待办、发信号' },
  },
  standalone: { productName: '桌面晾衣绳', startFeature: 'settings' },
}
fs.writeFileSync(new URL('../dist/whatevertools.json', import.meta.url), JSON.stringify(meta, null, 2) + '\n')
console.log(`dist/whatevertools.json v${pkg.version}`)
