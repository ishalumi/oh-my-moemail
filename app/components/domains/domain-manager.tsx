"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { Trash2, Globe, Zap, ChevronDown } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

interface Domain {
  id: string
  name: string
  type: "native" | "subdomain"
  parentDomain: string | null
  cfZoneId: string | null
  cfRouteEnabled: boolean
  enabled: boolean
  createdAt: number
}

export function DomainManager() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [newDomain, setNewDomain] = useState({ name: "", type: "native" as "native" | "subdomain", parentDomain: "" })
  const { toast } = useToast()

  const fetchDomains = async () => {
    const res = await fetch("/api/domains")
    const data = await res.json() as { domains: Domain[] }
    setDomains(data.domains)
    setLoading(false)
  }

  useEffect(() => { fetchDomains() }, [])

  const handleAdd = async () => {
    // 子域自动拼接：输入 "mail" + 父域 "ishalumi.me" → "mail.ishalumi.me"
    const fullName = newDomain.type === "subdomain" && newDomain.parentDomain
      ? `${newDomain.name}.${newDomain.parentDomain}`
      : newDomain.name

    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newDomain, name: fullName })
    })
    if (!res.ok) {
      const data = await res.json() as { error: string }
      toast({ title: "错误", description: data.error, variant: "destructive" })
      return
    }
    toast({ title: "成功", description: "域名已添加" })
    setAddOpen(false)
    setNewDomain({ name: "", type: "native", parentDomain: "" })
    fetchDomains()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/domains/${id}`, { method: "DELETE" })
    setDomains(prev => prev.filter(d => d.id !== id))
  }

  const handleEnableCfRouting = async (id: string) => {
    const res = await fetch(`/api/domains/${id}/cf-routing`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    })
    if (!res.ok) {
      const data = await res.json() as { error: string }
      toast({ title: "错误", description: data.error, variant: "destructive" })
      return
    }
    toast({ title: "成功", description: "CF Email Routing 已启用" })
    fetchDomains()
  }

  const nativeDomains = domains.filter(d => d.type === "native")
  const subDomains = domains.filter(d => d.type === "subdomain")

  if (loading) return null

  return (
    <div className="space-y-3">
      {/* 标题栏：可折叠 */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
          <h3 className="text-lg font-semibold">域名管理</h3>
          <span className="text-xs text-muted-foreground">({domains.length})</span>
        </button>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">添加域名</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>添加域名</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Select value={newDomain.type}
                onValueChange={v => setNewDomain(p => ({ ...p, type: v as "native" | "subdomain" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="native">原生域</SelectItem>
                  <SelectItem value="subdomain">子域</SelectItem>
                </SelectContent>
              </Select>
              {newDomain.type === "subdomain" && (
                <Select value={newDomain.parentDomain}
                  onValueChange={v => setNewDomain(p => ({ ...p, parentDomain: v }))}>
                  <SelectTrigger><SelectValue placeholder="选择父域名" /></SelectTrigger>
                  <SelectContent>
                    {nativeDomains.map(d => (
                      <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {newDomain.type === "native" ? (
                <Input placeholder="域名（如 example.com）" value={newDomain.name}
                  onChange={e => setNewDomain(p => ({ ...p, name: e.target.value }))} />
              ) : (
                <div className="flex items-center gap-1">
                  <Input placeholder="子域前缀（如 mail）" value={newDomain.name}
                    onChange={e => setNewDomain(p => ({ ...p, name: e.target.value }))} className="flex-1" />
                  {newDomain.parentDomain && (
                    <span className="text-sm text-muted-foreground shrink-0">.{newDomain.parentDomain}</span>
                  )}
                </div>
              )}
              <Button onClick={handleAdd} className="w-full">添加</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* 折叠内容 */}
      {expanded && (
        <div className="space-y-4">
          {/* 原生域列表 */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">原生域</h4>
            <div className="space-y-2">
              {nativeDomains.map(d => (
                <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span className="font-medium">{d.name}</span>
                    {d.cfRouteEnabled && <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">CF 路由已启用</span>}
                  </div>
                  <div className="flex gap-1">
                    {d.cfZoneId && !d.cfRouteEnabled && (
                      <Button variant="ghost" size="sm" onClick={() => handleEnableCfRouting(d.id)}>
                        <Zap className="h-4 w-4 mr-1" />启用路由
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 子域列表 */}
          {subDomains.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">子域</h4>
              <div className="space-y-2">
                {subDomains.map(d => (
                  <div key={d.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <span>{d.name}</span>
                      <span className="text-xs border px-2 py-0.5 rounded">{d.parentDomain}</span>
                      {d.cfRouteEnabled && <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded">CF 路由已启用</span>}
                    </div>
                    <div className="flex gap-1">
                      {d.cfZoneId && !d.cfRouteEnabled && (
                        <Button variant="ghost" size="sm" onClick={() => handleEnableCfRouting(d.id)}>
                          <Zap className="h-4 w-4 mr-1" />启用路由
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(d.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
