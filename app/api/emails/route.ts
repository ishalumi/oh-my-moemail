import { createDb } from "@/lib/db"
import { and, eq, gt, lt, or, sql, like, gte } from "drizzle-orm"
import { NextResponse } from "next/server"
import { emails } from "@/lib/schema"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"

export const runtime = "edge"

const PAGE_SIZE = 20
const PERMANENT_DATE = new Date('9999-01-01T00:00:00.000Z')

export async function GET(request: Request) {
  const userId = await getUserId()
  const { searchParams } = new URL(request.url)
  const cursor = searchParams.get('cursor')
  const type = searchParams.get('type')
  const domain = searchParams.get('domain')
  const search = searchParams.get('search')

  const db = createDb()

  try {
    const conditions = [
      eq(emails.userId, userId!),
      gt(emails.expiresAt, new Date())
    ]

    if (type === 'permanent') {
      conditions.push(gte(emails.expiresAt, PERMANENT_DATE))
    } else if (type === 'temporary') {
      conditions.push(lt(emails.expiresAt, PERMANENT_DATE))
    }

    if (domain) {
      conditions.push(like(emails.address, `%@${domain}`))
    }

    if (search) {
      const kw = search.toLowerCase()
      conditions.push(
        or(
          like(sql`LOWER(${emails.address})`, `%${kw}%`),
          like(sql`LOWER(COALESCE(${emails.label},''))`, `%${kw}%`)
        )!
      )
    }

    const baseConditions = and(...conditions)

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(baseConditions)
    const totalCount = Number(totalResult[0].count)

    const allConditions = [baseConditions]

    if (cursor) {
      const { timestamp, id } = decodeCursor(cursor)
      allConditions.push(
        or(
          lt(emails.createdAt, new Date(timestamp)),
          and(
            eq(emails.createdAt, new Date(timestamp)),
            lt(emails.id, id)
          )
        )
      )
    }

    const results = await db.query.emails.findMany({
      where: and(...allConditions),
      orderBy: (emails, { desc }) => [desc(emails.createdAt), desc(emails.id)],
      limit: PAGE_SIZE + 1
    })

    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore
      ? encodeCursor(results[PAGE_SIZE - 1].createdAt.getTime(), results[PAGE_SIZE - 1].id)
      : null
    const emailList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({ emails: emailList, nextCursor, total: totalCount })
  } catch (error) {
    console.error('Failed to fetch user emails:', error)
    return NextResponse.json({ error: "Failed to fetch emails" }, { status: 500 })
  }
}
