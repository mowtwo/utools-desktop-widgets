import { BUILTIN_EXTENSIONS } from '@/widget/builtins'

const IMAGE_DATA = /^data:image\//

/** 设置页监听它：聚焦到待办输入框 */
export const FOCUS_TODO_EVENT = 'focus-todo'

/** 处理从 uTools 进入插件：开关、截图、把图片 / 文字 / 文件挂上晾衣绳 */
export async function handlePluginEnter(action: UToolsPluginEnterAction) {
  const services = window.services
  if (!services) return
  services.start()
  services.seedExtensions(BUILTIN_EXTENSIONS)

  switch (action.code) {
    case 'toggle': {
      services.setEnabled(!services.getState().enabled)
      window.utools?.hideMainWindow()
      return
    }
    case 'todo': {
      if (action.type === 'over' && typeof action.payload === 'string') {
        services.addTodo(action.payload)
        window.utools?.hideMainWindow()
      } else {
        window.dispatchEvent(new Event(FOCUS_TODO_EVENT))
      }
      return
    }
    case 'peek': {
      services.peek()
      window.utools?.hideMainWindow()
      return
    }
    case 'capture': {
      window.utools?.hideMainWindow()
      try {
        const image = await window.utools!.screenCapture()
        services.setEnabled(true)
        services.addImageData(image)
      } catch {
        // 用户取消截图
      }
      return
    }
    case 'hang': {
      if (action.type === 'img' && typeof action.payload === 'string' && IMAGE_DATA.test(action.payload)) {
        services.addImageData(action.payload)
      } else if (action.type === 'over' && typeof action.payload === 'string') {
        services.addNote(action.payload)
      } else if (action.type === 'files' && Array.isArray(action.payload)) {
        services.addFiles((action.payload as UToolsMatchFile[]).map((f) => f.path))
      } else {
        return
      }
      services.setEnabled(true)
      window.utools?.hideMainWindow()
      return
    }
  }
}
