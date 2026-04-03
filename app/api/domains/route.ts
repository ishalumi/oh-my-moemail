import { createDb } from "@/lib/db"
import { domains } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

export const runtime = "edge"

export async function GET() {
  const db = createDb()
  const allDomains = await db.select().from(domains).where(eq(domains.enabled, true))
  return NextResponse.json({ domains: allDomains })
}

export async function POST(request: Request) {
  const db = createDb()
  const { name, type, parentDomain, cfZoneId } = await request.json() as {
    name: string
    type: "native" | "subdomain"
    parentDomain?: string
    cfZoneId?: string
  }

  if (!name || !type) {
    return NextResponse.json({ error: "域名和类型为必填项" }, { status: 400 })
  }

  if (type === "subdomain" && !parentDomain) {
    return NextResponse.json({ error: "子域名必须指定父域名" }, { status: 400 })
  }

  const existing = await db.query.domains.findFirst({
    where: eq(domains.name, name.toLowerCase())
  })
  if (existing) {
    return NextResponse.json({ error: "该域名已存在" }, { status: 409 })
  }

  // 子域名自动继承父域的 cfZoneId
  let resolvedZoneId = cfZoneId
  if (type === "subdomain" && parentDomain && !cfZoneId) {
    const parent = await db.query.domains.findFirst({
      where: eq(domains.name, parentDomain.toLowerCase())
    })
    if (parent?.cfZoneId) {
      resolvedZoneId = parent.cfZoneId
    }
  }

  const result = await db.insert(domains).values({
    name: name.toLowerCase(),
    type,
    parentDomain: parentDomain?.toLowerCase(),
    cfZoneId: resolvedZoneId,
  }).returning()

  return NextResponse.json({ domain: result[0] })
}
