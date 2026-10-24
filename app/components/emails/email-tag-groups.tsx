"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, ChevronRight, FolderOpen, Inbox } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { UNTAGGED_KEY } from "@/lib/email-tags"
import { EmailRow, type Email } from "./email-row"

export interface EmailFilters {
  type: "all" | "permanent" | "temporary"
  domain: string
  search: string
}

interface TagSummary {
  tags: { tag: string; count: number }[]
  untagged: number
  total: number
}

interface GroupState {
  emails: Email[]
  nextCursor: string | null
  loading: boolean
  loaded: boolean
}

interface EmailTagGroupsProps {
  filters: EmailFilters
  refreshKey: number
  selectedEmailId?: string
  onEmailSelect: (email: Email) => void
  onEditLabel: (email: Email) => void
  onDelete: (email: Email) => void
  onTotalChange: (total: number) => void
}

const EXPANDED_STORAGE_KEY = "moemail.expandedTagGroups"

function loadExpanded(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function applyFilters(url: URL, filters: EmailFilters) {
  if (filters.type !== "all") url.searchParams.set("type", filters.type)
  if (filters.domain && filters.domain !== "all") url.searchParams.set("domain", filters.domain)
  if (filters.search.trim()) url.searchParams.set("search", filters.search.trim())
}

const emptyGroup = (): GroupState => ({ emails: [], nextCursor: null, loading: false, loaded: false })

/**
 * 按标签折叠的邮箱抽屉。
 * 先拉一次标签计数（GROUP BY 聚合，不含邮箱本体），展开某个抽屉时才按 20 条/页拉组内邮箱，
 * 避免一次性返回全部邮箱。
 */
export function EmailTagGroups({
  filters,
  refreshKey,
  selectedEmailId,
  onEmailSelect,
  onEditLabel,
  onDelete,
  onTotalChange,
}: EmailTagGroupsProps) {
  const t = useTranslations("emails.list")
  const [summary, setSummary] = useState<TagSummary | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [groups, setGroups] = useState<Record<string, GroupState>>({})

  const filtersRef = useRef(filters)
  filtersRef.current = filters
  const expandedRef = useRef(expanded)
  expandedRef.current = expanded
  // 每轮刷新递增，丢弃过期请求的结果
  const generationRef = useRef(0)

  const fetchGroupPage = useCallback(async (key: string, cursor?: string) => {
    const generation = generationRef.current
    setGroups(prev => ({ ...prev, [key]: { ...(prev[key] ?? emptyGroup()), loading: true } }))
    try {
      const url = new URL("/api/emails", window.location.origin)
      applyFilters(url, filtersRef.current)
      if (key === UNTAGGED_KEY) url.searchParams.set("untagged", "1")
      else url.searchParams.set("tag", key)
      if (cursor) url.searchParams.set("cursor", cursor)

      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as { emails: Email[]; nextCursor: string | null }
      if (generation !== generationRef.current) return

      setGroups(prev => {
        const current = prev[key] ?? emptyGroup()
        return {
          ...prev,
          [key]: {
            emails: cursor ? [...current.emails, ...data.emails] : data.emails,
            nextCursor: data.nextCursor,
            loading: false,
            loaded: true,
          },
        }
      })
    } catch (error) {
      console.error("Failed to fetch tag group:", error)
      if (generation !== generationRef.current) return
      setGroups(prev => ({ ...prev, [key]: { ...(prev[key] ?? emptyGroup()), loading: false } }))
    }
  }, [])

  const reload = useCallback(async () => {
    const generation = ++generationRef.current
    setLoadingSummary(true)
    setGroups({})
    try {
      const url = new URL("/api/emails/tags", window.location.origin)
      applyFilters(url, filtersRef.current)
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json() as TagSummary
      if (generation !== generationRef.current) return

      setSummary(data)
      onTotalChange(data.total)

      // 展开状态按小写 key 记忆，拉取时用原始大小写的标签名
      const tagByKey = new Map(data.tags.map(g => [g.tag.toLowerCase(), g.tag]))
      if (data.untagged) tagByKey.set(UNTAGGED_KEY, UNTAGGED_KEY)
      for (const key of expandedRef.current) {
        const tag = tagByKey.get(key)
        if (tag) fetchGroupPage(tag)
      }
    } catch (error) {
      console.error("Failed to fetch email tags:", error)
    } finally {
      if (generation === generationRef.current) setLoadingSummary(false)
    }
  }, [fetchGroupPage, onTotalChange])

  useEffect(() => {
    setExpanded(loadExpanded())
  }, [])

  useEffect(() => {
    reload()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.type, filters.domain, filters.search, refreshKey])

  const toggle = (tag: string) => {
    const key = tag === UNTAGGED_KEY ? UNTAGGED_KEY : tag.toLowerCase()
    const next = new Set(expanded)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
      if (!groups[tag]?.loaded && !groups[tag]?.loading) fetchGroupPage(tag)
    }
    setExpanded(next)
    try {
      localStorage.setItem(EXPANDED_STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      // localStorage 不可用时只在内存里记住
    }
  }

  if (loadingSummary && !summary) {
    return <div className="text-center text-sm text-gray-500">{t("loading")}</div>
  }

  if (!summary || summary.total === 0) {
    return <div className="text-center text-sm text-gray-500">{t("noEmails")}</div>
  }

  const drawers = [
    ...summary.tags.map(g => ({ id: g.tag, key: g.tag.toLowerCase(), title: g.tag, count: g.count, untagged: false })),
    ...(summary.untagged > 0
      ? [{ id: UNTAGGED_KEY, key: UNTAGGED_KEY, title: t("untagged"), count: summary.untagged, untagged: true }]
      : []),
  ]

  return (
    <div className={cn("space-y-1", loadingSummary && "opacity-60")}>
      {drawers.map(drawer => {
        const isOpen = expanded.has(drawer.key)
        const group = groups[drawer.id]
        const Icon = drawer.untagged ? Inbox : FolderOpen
        return (
          <div key={drawer.key} className="rounded border border-primary/10">
            <button
              type="button"
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-primary/5 rounded"
              onClick={() => toggle(drawer.id)}
            >
              {isOpen ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
              <Icon className={cn("h-4 w-4 shrink-0", drawer.untagged ? "text-gray-400" : "text-primary/70")} />
              <span className={cn("truncate flex-1 text-left font-medium", drawer.untagged && "text-gray-500")}>
                {drawer.title}
              </span>
              <span className="text-xs text-gray-500 tabular-nums">{drawer.count}</span>
            </button>

            {isOpen && (
              <div className="pl-3 pr-1 pb-1 space-y-1">
                {group?.emails.map(email => (
                  <EmailRow
                    key={email.id}
                    email={email}
                    selected={selectedEmailId === email.id}
                    onSelect={onEmailSelect}
                    onEditLabel={onEditLabel}
                    onDelete={onDelete}
                  />
                ))}
                {group?.loading && (
                  <div className="text-center text-xs text-gray-500 py-1">{t("loadingMore")}</div>
                )}
                {!group?.loading && group?.nextCursor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={() => fetchGroupPage(drawer.id, group.nextCursor!)}
                  >
                    {t("loadMore", { loaded: group.emails.length, total: drawer.count })}
                  </Button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
