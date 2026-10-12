import { useMemo, useState } from 'react'
import { BookOpen, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BUILTIN_EXTENSIONS } from './builtins'
import { aiSkill, CTX_MEMBERS, ENTRY, RULES, typeDeclarations, UI_ELEMENTS } from './spec'

/** 给 AI 的 skill 文档：内置扩展作为示例 */
export function widgetSkill() {
  return aiSkill(BUILTIN_EXTENSIONS.map((e) => ({ name: e.name, code: e.code, settings: e.settings })))
}

function Code({ children }: { children: string }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">{children}</code>
}

/** 人看的说明：和类型声明、AI 文档出自同一份定义 */
function HumanDocs() {
  return (
    <div className="flex flex-col gap-4 text-xs leading-relaxed">
      <section>
        <h3 className="mb-1 text-sm font-medium">入口</h3>
        <Code>{ENTRY.signature}</Code>
        <p className="mt-1 text-muted-foreground">{ENTRY.doc}</p>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-medium">规则</h3>
        <ul className="list-disc pl-4 text-muted-foreground">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-medium">ctx</h3>
        <div className="flex flex-col gap-1.5">
          {CTX_MEMBERS.map((m) => (
            <div key={m.path}>
              <Code>{m.signature}</Code>
              <span className="ml-2 text-muted-foreground">{m.doc}</span>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-1 text-sm font-medium">ui 元素</h3>
        <div className="flex flex-col gap-3">
          {UI_ELEMENTS.map((el) => (
            <div key={el.name}>
              <Code>{el.signature}</Code>
              <span className="ml-2 text-muted-foreground">{el.doc}</span>
              {el.props.length > 0 && (
                <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pl-3">
                  {el.props.map((p) => (
                    <div key={p.name} className="contents">
                      <span className="font-mono text-[11px]">{p.name}</span>
                      <span className="text-muted-foreground">{p.doc}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export function WidgetDocsDialog() {
  const [copied, setCopied] = useState(false)
  const skill = useMemo(() => widgetSkill(), [])
  const dts = useMemo(() => typeDeclarations(), [])
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <BookOpen /> 文档
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>挂件扩展文档</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="human" className="flex min-h-0 flex-1 flex-col">
          <TabsList>
            <TabsTrigger value="human">使用说明</TabsTrigger>
            <TabsTrigger value="types">类型声明</TabsTrigger>
            <TabsTrigger value="ai">给 AI 的文档</TabsTrigger>
          </TabsList>
          <TabsContent value="human" className="min-h-0 flex-1 overflow-auto pr-1">
            <HumanDocs />
          </TabsContent>
          <TabsContent value="types" className="min-h-0 flex-1 overflow-auto">
            <pre className="rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{dts}</pre>
          </TabsContent>
          <TabsContent value="ai" className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              「AI 帮写」用的就是这份文档；也可以复制给别的 AI 工具
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  window.utools?.copyText(skill)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                <Copy /> {copied ? '已复制' : '复制'}
              </Button>
            </div>
            <pre className="min-h-0 flex-1 overflow-auto rounded-md bg-muted p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
              {skill}
            </pre>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
