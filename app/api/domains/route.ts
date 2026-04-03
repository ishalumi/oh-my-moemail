import { createDb } from "@/lib/db"
import { domains } from "@/lib/schema"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { getZoneIdByName, setupSubdomainDns, enableEmailRouting, createCatchAllRule } from "@/lib/cloudflare-email"

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

    // 子域：自动创建 DNS 记录 + 配置路由
    if (type === "subdomain" && resolvedZoneId) {
      await setupSubdomainDns(resolvedZoneId, name.toLowerCase())
      await createCatchAllRule(resolvedZoneId, "moemail-email-receiver")
      cfRouteEnabled = true
    }
  } catch (error) {
    console.error("CF auto-setup failed:", error)
    // CF 配置失败不阻断域名添加，后续可手动启用
  }

  const result = await db.insert(domains).values({
    name: name.toLowerCase(),
    type,
    parentDomain: parentDomain?.toLowerCase(),
    cfZoneId: resolvedZoneId,
    cfRouteEnabled,
  }).returning()

  return NextResponse.json({ domain: result[0] })
}
