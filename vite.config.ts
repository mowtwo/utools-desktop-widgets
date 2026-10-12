import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// uTools 以本地文件方式加载 dist/*.html，资源路径必须是相对路径
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
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
      },
    },
  },
})
