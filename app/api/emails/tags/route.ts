import { createDb } from "@/lib/db"
import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails } from "@/lib/schema"
import { getUserId } from "@/lib/apiKey"
import { buildEmailFilters, parseTags } from "@/lib/email-filters"

export const runtime = "edge"

/**
 * 标签分组概览：只返回每个标签的邮箱数量，不返回邮箱本身。
 * 一次 GROUP BY 聚合，结果行数 = 不同备注的数量；组内邮箱由前端按需分页拉取。
 */
export async function GET(request: Request) {
  const userId = await getUserId()
  const { searchParams } = new URL(request.url)
  searchParams.delete('tag')
  searchParams.delete('untagged')

  const db = createDb()

  try {
    const rows = await db
      .select({ label: emails.label, count: sql<number>`count(*)` })
      .from(emails)
      .where(buildEmailFilters(userId!, searchParams))
      .groupBy(emails.label)

    const groups = new Map<string, { tag: string; count: number }>()
    let untagged = 0
    let total = 0

    for (const row of rows) {
      const count = Number(row.count)
      total += count
      const tags = parseTags(row.label)
      if (tags.length === 0) {
        untagged += count
        continue
      }
      for (const tag of tags) {
        const key = tag.toLowerCase()
        const group = groups.get(key)
        if (group) group.count += count
        else groups.set(key, { tag, count })
      }
    }

    const tags = [...groups.values()].sort(
      (a, b) => b.count - a.count || a.tag.localeCompare(b.tag)
    )

    return NextResponse.json({ tags, untagged, total })
  } catch (error) {
    console.error('Failed to fetch email tags:', error)
    return NextResponse.json({ error: "Failed to fetch email tags" }, { status: 500 })
  }
}
