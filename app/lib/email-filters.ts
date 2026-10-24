import { and, gt, gte, like, lt, or, sql, eq, type SQL } from "drizzle-orm"
import { emails } from "@/lib/schema"

const PERMANENT_DATE = new Date('9999-01-01T00:00:00.000Z')

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

// 把备注规整成 ",tag1,tag2," 的形式，便于按完整标签匹配
const normalizedLabel = sql`',' || REPLACE(REPLACE(REPLACE(LOWER(COALESCE(${emails.label}, '')), '，', ','), ', ', ','), ' ,', ',') || ','`

export function hasTag(tag: string): SQL {
  const pattern = `%,${escapeLike(tag.trim().toLowerCase())},%`
  return sql`${normalizedLabel} LIKE ${pattern} ESCAPE '\\'`
}

export const isUntagged: SQL = sql`TRIM(REPLACE(REPLACE(COALESCE(${emails.label}, ''), ',', ''), '，', '')) = ''`

/**
 * 邮箱列表的公共筛选条件（用户、未过期、类型、域名、搜索），
 * 列表接口与标签分组接口共用，保证两边口径一致。
 */
export function buildEmailFilters(userId: string, searchParams: URLSearchParams): SQL {
  const conditions: (SQL | undefined)[] = [
    eq(emails.userId, userId),
    gt(emails.expiresAt, new Date())
  ]

  const type = searchParams.get('type')
  if (type === 'permanent') {
    conditions.push(gte(emails.expiresAt, PERMANENT_DATE))
  } else if (type === 'temporary') {
    conditions.push(lt(emails.expiresAt, PERMANENT_DATE))
  }

  const domain = searchParams.get('domain')
  if (domain) {
    conditions.push(like(emails.address, `%@${domain}`))
  }

  const search = searchParams.get('search')
  if (search) {
    const kw = search.toLowerCase()
    conditions.push(
      or(
        like(sql`LOWER(${emails.address})`, `%${kw}%`),
        like(sql`LOWER(COALESCE(${emails.label},''))`, `%${kw}%`)
      )
    )
  }

  if (searchParams.get('untagged') === '1') {
    conditions.push(isUntagged)
  } else {
    const tag = searchParams.get('tag')?.trim()
    if (tag) conditions.push(hasTag(tag))
  }

  return and(...conditions)!
}
