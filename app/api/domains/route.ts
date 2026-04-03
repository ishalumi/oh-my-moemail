import { createDb } from "@/lib/db"
import { domains } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { getZoneIdByName, setupSubdomainDns, createCatchAllRule } from "@/lib/cloudflare-email"
import { getRequestContext } from "@cloudflare/next-on-pages"

export const runtime = "edge"

export async function GET() {
  const db = createDb()
  const allDomains = await db.select().from(domains).where(eq(domains.enabled, true))
  return NextResponse.json({ domains: allDomains })
}

export async function POST(request: Request) {
  const db = createDb()
  const { name, type, parentDomain } = await request.json() as {
    name: string
    type: "native" | "subdomain"
    parentDomain?: string
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

  // 自动解析 CF Zone ID
  let resolvedZoneId: string | undefined
  let cfRouteEnabled = false
  let cfError: string | undefined
  try {
    if (type === "native") {
      resolvedZoneId = await getZoneIdByName(name.toLowerCase())
    } else if (parentDomain) {
      const parent = await db.query.domains.findFirst({
        where: eq(domains.name, parentDomain.toLowerCase())
      })
      if (parent?.cfZoneId) {
        resolvedZoneId = parent.cfZoneId
      } else {
        resolvedZoneId = await getZoneIdByName(parentDomain.toLowerCase())
      }
    }
  } catch (error) {
    cfError = `Zone ID 解析失败: ${error instanceof Error ? error.message : String(error)}`
  }

  // 子域：自动创建 DNS 记录 + 配置路由
  if (type === "subdomain" && resolvedZoneId) {
    try {
      await setupSubdomainDns(resolvedZoneId, name.toLowerCase())
      await createCatchAllRule(resolvedZoneId, "email-receiver-worker")
      cfRouteEnabled = true
    } catch (error) {
      cfError = `CF 路由配置失败: ${error instanceof Error ? error.message : String(error)}`
    }
  }

  const result = await db.insert(domains).values({
    name: name.toLowerCase(),
    type,
    parentDomain: parentDomain?.toLowerCase(),
    cfZoneId: resolvedZoneId,
    cfRouteEnabled,
  }).returning()

  return NextResponse.json({ domain: result[0], cfError })
}
