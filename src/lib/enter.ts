const IMAGE_DATA = /^data:image\//

/** 处理从 uTools 进入插件：开关、截图、把图片 / 文字 / 文件挂上晾衣绳 */
export async function handlePluginEnter(action: UToolsPluginEnterAction) {
  const services = window.services
  if (!services) return
  services.start()

  switch (action.code) {
    case 'toggle': {
      services.setEnabled(!services.getState().enabled)
      window.utools?.hideMainWindow()
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
