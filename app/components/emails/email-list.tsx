"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useTranslations } from "next-intl"
import { CreateDialog } from "./create-dialog"
import { EmailRow, type Email } from "./email-row"
import { EmailTagGroups } from "./email-tag-groups"
import { RefreshCw, Search, List, FolderTree } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useThrottle } from "@/hooks/use-throttle"
import { EMAIL_CONFIG } from "@/config"
import { useToast } from "@/components/ui/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ROLES } from "@/lib/permissions"
import { useUserRole } from "@/hooks/use-user-role"
import { useConfig } from "@/hooks/use-config"

type ViewMode = "list" | "grouped"
const VIEW_MODE_STORAGE_KEY = "moemail.emailViewMode"

interface EmailListProps {
  onEmailSelect: (email: Email | null) => void
  selectedEmailId?: string
}

interface EmailResponse {
  emails: Email[]
  nextCursor: string | null
  total: number
}

export function EmailList({ onEmailSelect, selectedEmailId }: EmailListProps) {
  const { data: session } = useSession()
  const { config } = useConfig()
  const { role } = useUserRole()
  const t = useTranslations("emails.list")
  const tCommon = useTranslations("common.actions")
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [emailToDelete, setEmailToDelete] = useState<Email | null>(null)
  const [emailToEditLabel, setEmailToEditLabel] = useState<Email | null>(null)
  const [labelDraft, setLabelDraft] = useState("")
  const [savingLabel, setSavingLabel] = useState(false)
  const [activeTab, setActiveTab] = useState<"all" | "permanent" | "temporary">("all")
  const [selectedDomain, setSelectedDomain] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [debouncedSearch, setDebouncedSearch] = useState<string>("")
  const [viewMode, setViewMode] = useState<ViewMode>("grouped")
  const [refreshKey, setRefreshKey] = useState(0)
  const { toast } = useToast()

  // 用 ref 跟踪最新值，避免闭包捕获旧值
  const activeTabRef = useRef(activeTab)
  const selectedDomainRef = useRef(selectedDomain)
  const searchQueryRef = useRef(debouncedSearch)
  const emailsRef = useRef(emails)
  activeTabRef.current = activeTab
  selectedDomainRef.current = selectedDomain
  searchQueryRef.current = debouncedSearch
  emailsRef.current = emails
  const isGrouped = viewMode === "grouped"

  useEffect(() => {
    const saved = localStorage.getItem(VIEW_MODE_STORAGE_KEY)
    if (saved === "list" || saved === "grouped") setViewMode(saved)
  }, [])

  const changeViewMode = (mode: ViewMode) => {
    setViewMode(mode)
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode)
    } catch {
      // 忽略 localStorage 不可用
    }
  }

  const fetchEmails = useCallback(async (cursor?: string) => {
    try {
      const url = new URL("/api/emails", window.location.origin)
      if (cursor) url.searchParams.set('cursor', cursor)
      if (activeTabRef.current !== 'all') url.searchParams.set('type', activeTabRef.current)
      if (selectedDomainRef.current && selectedDomainRef.current !== 'all') url.searchParams.set('domain', selectedDomainRef.current)
      if (searchQueryRef.current.trim()) url.searchParams.set('search', searchQueryRef.current.trim())

      const response = await fetch(url)
      const data = await response.json() as EmailResponse

      if (!cursor) {
        const newEmails = data.emails
        const oldEmails = emailsRef.current

        const lastDuplicateIndex = newEmails.findIndex(
          newEmail => oldEmails.some(oldEmail => oldEmail.id === newEmail.id)
        )

        if (lastDuplicateIndex === -1) {
          setEmails(newEmails)
          setNextCursor(data.nextCursor)
          setTotal(data.total)
          return
        }
        const uniqueNewEmails = newEmails.slice(0, lastDuplicateIndex)
        setEmails([...uniqueNewEmails, ...oldEmails])
        setTotal(data.total)
        return
      }
      setEmails(prev => [...prev, ...data.emails])
      setNextCursor(data.nextCursor)
      setTotal(data.total)
    } catch (error) {
      console.error("Failed to fetch emails:", error)
    } finally {
      setLoading(false)
      setRefreshing(false)
      setLoadingMore(false)
    }
  }, [])

  const reloadList = () => {
    setEmails([])
    setNextCursor(null)
    setLoading(true)
    fetchEmails()
  }

  const handleRefresh = async () => {
    if (isGrouped) {
      setRefreshKey(k => k + 1)
      return
    }
    setRefreshing(true)
    await fetchEmails()
  }

  const handleScroll = useThrottle((e: React.UIEvent<HTMLDivElement>) => {
    if (isGrouped || loadingMore) return

    const { scrollHeight, scrollTop, clientHeight } = e.currentTarget
    const threshold = clientHeight * 1.5
    const remainingScroll = scrollHeight - scrollTop

    if (remainingScroll <= threshold && nextCursor) {
      setLoadingMore(true)
      fetchEmails(nextCursor)
    }
  }, 200)

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // 列表模式：登录、筛选、切回列表时重新加载；分组模式由 EmailTagGroups 自己拉
  useEffect(() => {
    if (session && !isGrouped) reloadList()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, activeTab, selectedDomain, debouncedSearch, isGrouped])

  const handleDelete = async (email: Email) => {
    try {
      const response = await fetch(`/api/emails/${email.id}`, {
        method: "DELETE"
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: t("error"),
          description: (data as { error: string }).error,
          variant: "destructive"
        })
        return
      }

      setEmails(prev => prev.filter(e => e.id !== email.id))
      setTotal(prev => prev - 1)
      if (isGrouped) setRefreshKey(k => k + 1)

      toast({
        title: t("success"),
        description: t("deleteSuccess")
      })

      if (selectedEmailId === email.id) {
        onEmailSelect(null)
      }
    } catch {
      toast({
        title: t("error"),
        description: t("deleteFailed"),
        variant: "destructive"
      })
    } finally {
      setEmailToDelete(null)
    }
  }

  const handleSaveLabel = async () => {
    if (!emailToEditLabel) return
    setSavingLabel(true)
    try {
      const response = await fetch(`/api/emails/${emailToEditLabel.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: labelDraft.trim() })
      })

      if (!response.ok) {
        const data = await response.json()
        toast({
          title: t("error"),
          description: (data as { error: string }).error || t("labelSaveFailed"),
          variant: "destructive"
        })
        return
      }

      const newLabel = labelDraft.trim() || null
      setEmails(prev => prev.map(e => e.id === emailToEditLabel.id ? { ...e, label: newLabel } : e))
      if (isGrouped) setRefreshKey(k => k + 1)
      toast({ title: t("success"), description: t("labelSaved") })
      setEmailToEditLabel(null)
    } catch {
      toast({ title: t("error"), description: t("labelSaveFailed"), variant: "destructive" })
    } finally {
      setSavingLabel(false)
    }
  }

  const openLabelEditor = (email: Email) => {
    setLabelDraft(email.label || "")
    setEmailToEditLabel(email)
  }

  if (!session) return null

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="p-2 flex flex-col gap-2 border-b border-primary/20">
          {/* 第一行：刷新 + 计数 + 创建 */}
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={refreshing}
                className={cn("h-8 w-8", refreshing && "animate-spin")}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <span className="text-xs text-gray-500">
                {role === ROLES.EMPEROR ? (
                  t("emailCountUnlimited", { count: total })
                ) : (
                  t("emailCount", { count: total, max: config?.maxEmails || EMAIL_CONFIG.MAX_ACTIVE_EMAILS })
                )}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant={isGrouped ? "ghost" : "secondary"}
                size="icon"
                className="h-8 w-8"
                title={t("viewList")}
                onClick={() => changeViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={isGrouped ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8"
                title={t("viewGrouped")}
                onClick={() => changeViewMode("grouped")}
              >
                <FolderTree className="h-4 w-4" />
              </Button>
              <CreateDialog onEmailCreated={handleRefresh} />
            </div>
          </div>

          {/* 第二行：Tab 切换 */}
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
            <TabsList className="w-full">
              <TabsTrigger value="all" className="flex-1">{t("tabAll")}</TabsTrigger>
              <TabsTrigger value="permanent" className="flex-1">{t("tabPermanent")}</TabsTrigger>
              <TabsTrigger value="temporary" className="flex-1">{t("tabTemporary")}</TabsTrigger>
            </TabsList>
          </Tabs>

          {/* 第三行：搜索 + 域名筛选 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="pl-8 h-8 text-sm"
              />
            </div>
            {(config?.emailDomainsArray?.length ?? 0) > 1 && (
              <Select value={selectedDomain} onValueChange={setSelectedDomain}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue placeholder={t("allDomains")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("allDomains")}</SelectItem>
                  {config?.emailDomainsArray?.map(d => (
                    <SelectItem key={d} value={d}>@{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto p-2" onScroll={handleScroll}>
          {isGrouped ? (
            <EmailTagGroups
              filters={{ type: activeTab, domain: selectedDomain, search: debouncedSearch }}
              refreshKey={refreshKey}
              selectedEmailId={selectedEmailId}
              onEmailSelect={onEmailSelect}
              onEditLabel={openLabelEditor}
              onDelete={setEmailToDelete}
              onTotalChange={setTotal}
            />
          ) : loading ? (
            <div className="text-center text-sm text-gray-500">{t("loading")}</div>
          ) : emails.length > 0 ? (
            <div className="space-y-1">
              {emails.map(email => (
                <EmailRow
                  key={email.id}
                  email={email}
                  selected={selectedEmailId === email.id}
                  onSelect={onEmailSelect}
                  onEditLabel={openLabelEditor}
                  onDelete={setEmailToDelete}
                />
              ))}
              {loadingMore && (
                <div className="text-center text-sm text-gray-500 py-2">
                  {t("loadingMore")}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500">
              {t("noEmails")}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!emailToEditLabel} onOpenChange={(o) => !o && setEmailToEditLabel(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("editLabel")}</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div className="text-sm text-muted-foreground truncate">{emailToEditLabel?.address}</div>
            <Input
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              placeholder={t("labelPlaceholder")}
              onKeyDown={(e) => { if (e.key === "Enter" && !savingLabel) handleSaveLabel() }}
              autoFocus
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setEmailToEditLabel(null)} disabled={savingLabel}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSaveLabel} disabled={savingLabel}>
              {savingLabel ? "..." : tCommon("save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!emailToDelete} onOpenChange={() => setEmailToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirm")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription", { email: emailToDelete?.address || "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => emailToDelete && handleDelete(emailToDelete)}
            >
              {tCommon("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
