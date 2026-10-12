// 仅声明本插件用到的 uTools API（依据 uTools 官方开发文档）与 preload 暴露的接口

interface UToolsMatchFile {
  isFile: boolean
  isDirectory: boolean
  name: string
  path: string
}

interface UToolsPluginEnterAction {
  code: string
  type: 'text' | 'img' | 'files' | 'regex' | 'over' | 'window'
  payload: unknown
  from: 'main' | 'panel' | 'hotkey' | 'redirect'
}

interface UToolsApi {
  onPluginEnter(cb: (action: UToolsPluginEnterAction) => void): void
  isDarkColors(): boolean
  isDev(): boolean
  hideMainWindow(isRestorePreWindow?: boolean): boolean
  showNotification(body: string, clickFeatureCode?: string): void
  screenCapture(): Promise<string>
  showOpenDialog(options: { title?: string; properties?: string[] }): string[] | undefined
}

interface Window {
  utools?: UToolsApi
  /** 插件应用主界面 preload（public/preload.js） */
  services?: {
    getState(): import('./line').LineState
    subscribe(listener: (state: import('./line').LineState) => void): () => void
    listDisplays(): import('./line').DisplayInfo[]
    start(): void
    setEnabled(enabled: boolean): void
    setMode(mode: import('./line').LineMode): void
    setHandle(handle: import('./line').HandlePosition | null): void
    setDisplay(displayId: number | null): void
    setClock(clock: boolean): void
    setMaxItems(maxItems: number): void
    addImageData(dataUrl: string): void
    addNote(text: string): void
    addFiles(paths: string[]): void
    removeItem(id: string): void
    clearItems(): void
    peek(): void
    openOverlayDevTools(): void
  }
  /** 悬浮层窗口 preload（public/overlay_preload.js） */
  overlay?: {
    onState(listener: (payload: import('./line').OverlayPayload) => void): void
    onPeek(listener: (duration?: number) => void): void
    ready(): void
    setInteractive(interactive: boolean): void
    repaint(): void
    remove(id: string): void
    move(id: string, x: number): void
    addClip(x: number): void
    fillClip(clipId: string, source: 'files' | 'paste' | 'capture'): void
    drop(files: FileList, x: number, clipId?: string): void
    watchCursor(listener: (point: { x: number; y: number }) => void): () => void
    copyImage(filePath: string): boolean
    copyText(text: string): boolean
    copyFile(filePath: string): boolean
    openPath(filePath: string): Promise<string>
    openExternal(url: string): Promise<void>
    startDrag(filePath: string): void
    isDarkColors(): boolean
    isDev(): boolean
  }
}
