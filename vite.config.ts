import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import whatevertools from '@whatevertools/vite'
import { defineConfig } from 'vite'
import pkg from './package.json' with { type: 'json' }

// uTools 以本地文件方式加载 dist/*.html，资源路径必须是相对路径
export default defineConfig({
  base: './',
  // 构建时间写进代码，日志里据此判断测的是哪次构建
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()), __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    // 构建时写 dist/whatevertools.json：给 whatevertools 兼容层（Electron 独立应用、网页版）用的身份、权限说明和独立应用配置。
    // uTools 不读这个文件，plugin.json 不用改；vite dev 时在普通浏览器里模拟插件环境
    whatevertools({
      manifest: {
        id: 'desktop-widgets',
        name: '桌面晾衣绳',
        homepage: 'https://github.com/mowtwo/utools-desktop-widgets',
        // 透明置顶悬浮层、桌面地毯只在桌面上成立，不出网页版
        targets: ['utools', 'electron'],
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
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, './src') },
  },
  build: {
    // uTools Runtime: Electron 34 / Chromium 132
    target: 'chrome132',
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // 插件应用主界面：设置页
        index: path.resolve(import.meta.dirname, 'index.html'),
        // 自定义窗口：每块屏幕一个全屏透明悬浮层
        overlay: path.resolve(import.meta.dirname, 'overlay.html'),
        // 自定义窗口：桌面地毯，铺在桌面图标上、所有应用窗口下面
        rug: path.resolve(import.meta.dirname, 'rug.html'),
      },
    },
  },
})
