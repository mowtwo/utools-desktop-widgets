import { Info } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const REPO_URL = 'https://github.com/mowtwo/utools-desktop-widgets'

/** 本插件借鉴 / 移植的作品（与 README 的致谢一致） */
const CREDITS: Array<{ name: string; url: string; what: string; license: string }> = [
  { name: 'Tendedero', url: 'https://github.com/alejandrobujan/tendedero', what: '晾衣绳造型参考', license: 'MIT' },
  { name: 'desktop-rug', url: 'https://github.com/josssphzhou/desktop-rug', what: '桌面地毯移植自此项目，创意与视觉设计来自 Terkel', license: 'MIT' },
  { name: 'lolPing', url: 'https://github.com/darrenprx/lolPing', what: '信号轮盘与特效移植自此项目', license: 'MIT' },
  { name: 'game-icons.net', url: 'https://game-icons.net', what: '开源风格信号的图标（Lorc、Delapouite、Carl Olsen）', license: 'CC BY 3.0' },
  { name: 'Kenney', url: 'https://kenney.nl', what: '开源风格信号的音效', license: 'CC0' },
]

/** 打开外部链接：uTools 里用系统浏览器 */
function openLink(url: string) {
  if (window.utools) void window.utools.shellOpenExternal(url)
  else window.open(url, '_blank', 'noopener')
}

export function AboutDialog() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="ghost" size="icon-sm" title="关于与版权" onClick={() => setOpen(true)}>
        <Info />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>关于桌面晾衣绳</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-xs">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">版本</span>
              <span className="font-mono">v{__APP_VERSION__}</span>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">原始仓库（免费开源，MIT 许可证）</div>
              <button className="break-all text-left text-primary underline-offset-2 hover:underline" onClick={() => openLink(REPO_URL)}>
                {REPO_URL}
              </button>
            </div>
            <div className="space-y-2">
              <div className="text-muted-foreground">借鉴与移植</div>
              {CREDITS.map((c) => (
                <div key={c.name} className="space-y-0.5 rounded-md border px-2.5 py-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <button className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => openLink(c.url)}>
                      {c.name}
                    </button>
                    <span className="shrink-0 text-muted-foreground">{c.license}</span>
                  </div>
                  <div className="text-muted-foreground">{c.what}</div>
                  <div className="break-all text-[11px] text-muted-foreground/70">{c.url}</div>
                </div>
              ))}
            </div>
            <p className="leading-relaxed text-muted-foreground">
              本插件依据 Riot Games 的「Legal Jibber Jabber」政策使用 Riot Games 拥有的素材制作，Riot Games 不认可也不赞助本项目。
            </p>
            <p className="text-muted-foreground">Copyright © 2026 mowtwo</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
