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

interface UToolsAiMessage {
  role: 'system' | 'user' | 'assistant'
  content?: string
  reasoning_content?: string
}

interface UToolsAiPromise<T> extends Promise<T> {
  abort(): void
}

interface UToolsAiModel {
  id: string
  label: string
  icon: string
  cost?: number
}

interface UToolsApi {
  ai(options: { model?: string; messages: UToolsAiMessage[] }, stream: (chunk: UToolsAiMessage) => void): UToolsAiPromise<void>
  allAiModels(): Promise<UToolsAiModel[]>
  onPluginEnter(cb: (action: UToolsPluginEnterAction) => void): void
  isDarkColors(): boolean
  isDev(): boolean
  hideMainWindow(isRestorePreWindow?: boolean): boolean
  showNotification(body: string, clickFeatureCode?: string): void
  screenCapture(): Promise<string>
  showOpenDialog(options: { title?: string; properties?: string[] }): string[] | undefined
  startDrag(filePath: string | string[]): void
  copyText(text: string): boolean
  shellOpenExternal(url: string): Promise<void>
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
    setHideDelay(ms: number): void
    setDebugHud(on: boolean): void
    setFocusOnReveal(on: boolean): void
    setRenderAnchor(on: boolean): void
    ping(): void
    setPing(patch: Partial<import('./line').PingSettings>): void
    pingHotKey(): string | null
    setPingHotKey(): void
    setRug(patch: Partial<import('./line').RugSettings>): void
    resetRug(): void
    seedExtensions(builtins: import('@/widget/protocol').WidgetExtension[]): void
    saveExtension(ext: Omit<import('@/widget/protocol').WidgetExtension, 'id'> & { id?: string }): string
    removeExtension(id: string): void
    hangWidget(ext: string): void
    addTodo(text: string): void
    setDisplay(displayId: number | null): void
    setMaxItems(maxItems: number): void
    addImageData(dataUrl: string): void
    addNote(text: string): void
    addFiles(paths: string[]): void
    removeItem(id: string): void
    clearItems(): void
    peek(): void
    openOverlayDevTools(): void
    clearExtErrors(ext: string): void
    hasKeepAlive(): boolean
    requestKeepAlive(): Promise<boolean>
    removeKeepAlive(): void
  }
  /** 悬浮层窗口 preload（public/overlay_preload.js） */
  overlay?: {
    log(event: string, detail?: unknown): void
    onPingOpen(listener: (point: { x: number; y: number }) => void): void
    pingCapture(rect: { x: number; y: number; width: number; height: number }): Promise<{ dataUrl?: string; scale?: number; error?: string }>
    pingResult(dataUrl: string): void
    onState(listener: (payload: import('./line').OverlayPayload) => void): void
    onPeek(listener: (duration?: number) => void): void
    ready(): void
    setInteractive(interactive: boolean): void
    repaint(): void
    remove(id: string): void
    move(id: string, x: number): void
    addClip(x: number): void
    fillClip(clipId: string, source: 'files' | 'folder' | 'paste' | 'capture' | `widget:${string}`): void
    drop(files: FileList, x: number, clipId?: string): void
    addTodo(text: string, clipId?: string): void
    /** 让悬浮层获得键盘焦点（在夹子上直接打字时） */
    focus(): void
    focusOnReveal(): void
    listFolder(dir: string, limit: number): { total: number; entries: import('./line').FolderEntry[]; error?: string }
    saveWidgetData(id: string, data: Record<string, unknown>): void
    notify(text: string): void
    reportWidgetError(ext: string, message: string, line?: number, fatal?: boolean): void
    watchCursor(listener: (point: { x: number; y: number }) => number | void): () => void
    copyImage(filePath: string): boolean
    copyText(text: string): boolean
    copyFile(filePath: string): boolean
    openPath(filePath: string): Promise<string>
    openExternal(url: string): Promise<void>
    startDrag(filePath: string): void
    isDarkColors(): boolean
  }
}
