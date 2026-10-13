import { defineConfig } from '@whatevertools/cli'

// pnpm release：把 dist（uTools 插件）打包成各目标，产物在 out/<目标>/
// pnpm release:app：另外出 Electron 安装包（签名、公证凭据走环境变量，见 https://whatevertools.mowtwo.com/guide/packaging）
export default defineConfig({
  plugins: './dist',
  targets: ["utools", "electron"],
  out: 'out',
  productName: '桌面晾衣绳',
  electron: {
    binary: {
      formats: { mac: ['dmg', 'zip'], win: ['nsis'], linux: ['AppImage'] },
      icon: 'release/logo/logo-1024.png',
    },
  },
})
