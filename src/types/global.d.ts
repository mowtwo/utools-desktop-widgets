// uTools API 的完整类型来自 @whatevertools/utools（只有 .d.ts，不进打包产物，不影响 uTools 的打包和发布）
/// <reference types="@whatevertools/utools/namespace" />

type UToolsApi = UTools.Api
type UToolsMatchFile = UTools.MatchFile
type UToolsPluginEnterAction = UTools.PluginEnterAction
/** 本插件只用纯文字消息 */
type UToolsAiMessage = UTools.AiMessage & { content?: string }
type UToolsAiPromise<T> = UTools.AiPromise<T>
type UToolsAiModel = UTools.AiModel

/** 构建时从 package.json 注入的版本号 */
declare const __APP_VERSION__: string

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
    editRug(): void
    seedExtensions(builtins: import('@/widget/protocol').WidgetExtension[]): void
    saveExtension(ext: Omit<import('@/widget/protocol').WidgetExtension, 'id'> & { id?: string }): string
    removeExtension(id: string): void
    hangWidget(ext: string): void
    addTodo(text: string): boolean
    addTodoLine(cardId: string, text: string): boolean
    removeTodoLine(cardId: string, lineId: string): void
    toggleTodoLine(cardId: string, lineId: string): void
    completeTodoCard(cardId: string): void
    newTodoCard(text?: string): void
    setTodoTarget(id: string | null): void
    setTodoColor(cardId: string, color: import('./line').TodoColor): void
    setDisplay(displayId: number | null): void
    setMultiLine(multiLine: boolean): void
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
    onPingFire(listener: (payload: { x: number; y: number; signal: string }) => void): void
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
    todoToggle(cardId: string, lineId: string): void
    todoDelete(cardId: string, lineId: string): void
    todoComplete(cardId: string): void
    todoAdd(cardId: string, text: string): void
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
