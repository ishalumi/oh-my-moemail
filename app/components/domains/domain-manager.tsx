"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { Trash2, Globe, Zap, ChevronDown, Download, Check } from "lucide-react"
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

interface CfZone {
  id: string
  name: string
  status: string
}

export function DomainManager() {
  const [domains, setDomains] = useState<Domain[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [cfZones, setCfZones] = useState<CfZone[]>([])
  const [selectedZones, setSelectedZones] = useState<Set<string>>(new Set())
  const [importLoading, setImportLoading] = useState(false)
  const [importing, setImporting] = useState(false)
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
    const fullName = newDomain.type === "subdomain" && newDomain.parentDomain
      ? `${newDomain.name}.${newDomain.parentDomain}`
      : newDomain.name

    const res = await fetch("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newDomain, name: fullName })
    })
    if (!res.ok && res.status !== 207) {
      const data = await res.json() as { error: string }
      toast({ title: "错误", description: data.error, variant: "destructive" })
      return
    }
    const data = await res.json() as { domain: Domain; cfError?: string }
    if (data.cfError) {
      toast({ title: "域名已添加，但 CF 配置失败", description: data.cfError, variant: "destructive" })
    } else {
      toast({ title: "成功", description: "域名已添加" })
    }
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

  // 从 CF 获取所有域名
  const handleFetchCfZones = async () => {
    setImportLoading(true)
    try {
      const res = await fetch("/api/domains/cf-zones")
      const data = await res.json() as { zones?: CfZone[]; error?: string }
      if (data.error) {
        toast({ title: "错误", description: data.error, variant: "destructive" })
        return
      }
      setCfZones(data.zones || [])
      setSelectedZones(new Set())
    } catch {
      toast({ title: "错误", description: "获取 CF 域名列表失败", variant: "destructive" })
    } finally {
      setImportLoading(false)
    }
  }

  // 批量导入选中的域名
  const handleImport = async () => {
    if (selectedZones.size === 0) return
    setImporting(true)
    const existingNames = new Set(domains.map(d => d.name))
    let added = 0
    let skipped = 0

    for (const zoneName of selectedZones) {
      if (existingNames.has(zoneName)) {
        skipped++
        continue
      }
      try {
        const res = await fetch("/api/domains", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: zoneName, type: "native" })
        })
        if (res.ok) added++
        else skipped++
      } catch {
        skipped++
      }
    }

    toast({
      title: "导入完成",
      description: `已添加 ${added} 个域名${skipped > 0 ? `，${skipped} 个已存在或失败` : ""}`
    })
    setImportOpen(false)
    setSelectedZones(new Set())
    fetchDomains()
    setImporting(false)
  }

  const toggleZone = (name: string) => {
    setSelectedZones(prev => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleAll = () => {
    const existingNames = new Set(domains.map(d => d.name))
    const available = cfZones.filter(z => !existingNames.has(z.name))
    if (selectedZones.size === available.length) {
      setSelectedZones(new Set())
    } else {
      setSelectedZones(new Set(available.map(z => z.name)))
    }
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
        <div className="flex gap-2">
          {/* 从 CF 导入 */}
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" onClick={() => { setImportOpen(true); handleFetchCfZones() }}>
                <Download className="h-4 w-4 mr-1" />从 CF 导入
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>从 Cloudflare 导入域名</DialogTitle></DialogHeader>
              {importLoading ? (
                <div className="py-8 text-center text-sm text-muted-foreground">加载 CF 域名列表...</div>
              ) : cfZones.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">未找到域名，请检查 CF API Token 配置</div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">共 {cfZones.length} 个域名</span>
                    <Button variant="ghost" size="sm" onClick={toggleAll}>
                      {selectedZones.size === cfZones.filter(z => !domains.some(d => d.name === z.name)).length ? "取消全选" : "全选可用"}
                    </Button>
                  </div>
                  <div className="max-h-[300px] overflow-auto space-y-1">
                    {cfZones.map(zone => {
                      const exists = domains.some(d => d.name === zone.name)
                      const selected = selectedZones.has(zone.name)
                      return (
                        <div
                          key={zone.id}
                          onClick={() => !exists && toggleZone(zone.name)}
                          className={cn(
                            "flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors",
                            exists && "opacity-50 cursor-not-allowed bg-muted",
                            selected && !exists && "border-primary bg-primary/5",
                            !exists && !selected && "hover:bg-muted/50"
                          )}
                        >
                          <div className={cn(
                            "h-4 w-4 rounded border flex items-center justify-center shrink-0",
                            selected && !exists && "bg-primary border-primary",
                            exists && "bg-muted-foreground/20"
                          )}>
                            {(selected || exists) && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium">{zone.name}</span>
                          </div>
                          {exists && <span className="text-xs text-muted-foreground shrink-0">已添加</span>}
                        </div>
                      )
                    })}
                  </div>
                  <Button onClick={handleImport} disabled={selectedZones.size === 0 || importing} className="w-full">
                    {importing ? "导入中..." : `导入 ${selectedZones.size} 个域名`}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
          {/* 手动添加 */}
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
