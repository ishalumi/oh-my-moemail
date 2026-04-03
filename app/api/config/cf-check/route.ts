import { NextResponse } from "next/server"
import { getRequestContext } from "@cloudflare/next-on-pages"

export const runtime = "edge"

export async function GET() {
  const env = getRequestContext().env
  const token = await env.SITE_CONFIG.get("CF_API_TOKEN")
  const accountId = await env.SITE_CONFIG.get("CF_ACCOUNT_ID")

  const result = {
    tokenConfigured: !!token,
    tokenPreview: token ? token.slice(0, 8) + "..." : "",
    accountIdConfigured: !!accountId,
    accountId: accountId || "",
    apiReachable: false,
    apiError: "",
    zones: [] as Array<{ id: string; name: string }>,
  }

  if (!token) {
    result.apiError = "CF_API_TOKEN 未配置"
    return NextResponse.json(result)
  }

  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/zones?per_page=5&status=active", {
      headers: { "Authorization": `Bearer ${token}` },
    })
    const data = await res.json() as { success: boolean; errors?: Array<{ message: string }>; result?: Array<{ id: string; name: string }> }

    if (data.success) {
      result.apiReachable = true
      result.zones = (data.result || []).map(z => ({ id: z.id, name: z.name }))
    } else {
      result.apiError = data.errors?.[0]?.message || `HTTP ${res.status}`
    }
  } catch (error) {
    result.apiError = error instanceof Error ? error.message : "网络错误"
  }

  return NextResponse.json(result)
}
