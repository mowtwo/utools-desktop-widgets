// 仅声明本插件用到的 uTools API（依据 uTools 官方开发文档）与 preload 暴露的接口

interface UToolsPluginEnterAction {
  code: string
  type: 'text' | 'img' | 'files' | 'regex' | 'over' | 'window'
  payload: unknown
  from: 'main' | 'panel' | 'hotkey' | 'redirect'
}

interface UToolsApi {
  onPluginEnter(cb: (action: UToolsPluginEnterAction) => void): void
  isDarkColors(): boolean
  hideMainWindow(isRestorePreWindow?: boolean): boolean
  dbStorage: {
    setItem(key: string, value: unknown): void
    getItem(key: string): unknown
    removeItem(key: string): boolean
  }
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

interface Window {
  utools?: UToolsApi
  /** 插件应用主界面 preload（public/preload.js） */
  services?: {
    showOverlays(settings: import('./settings').Settings): void
    hideOverlays(): void
    isOverlayVisible(): boolean
    onWidgetMoved(listener: (id: string, x: number, y: number) => void): void
  }
  /** 悬浮层窗口 preload（public/overlay_preload.js） */
  overlay?: {
    displayId: number
    onSettings(listener: (payload: { settings: import('./settings').Settings; bounds: Rect }) => void): void
    ready(): void
    setInteractive(interactive: boolean): void
    moveWidget(id: string, x: number, y: number): void
  }
}
