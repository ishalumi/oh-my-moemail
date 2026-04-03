import { getRequestContext } from "@cloudflare/next-on-pages"

const CF_API_BASE = "https://api.cloudflare.com/client/v4"

async function getCfCredentials() {
  const env = getRequestContext().env
  const token = await env.SITE_CONFIG.get("CF_API_TOKEN")
  const accountId = await env.SITE_CONFIG.get("CF_ACCOUNT_ID")
  return { token, accountId }
}

async function cfFetch(path: string, options: RequestInit = {}) {
  const { token } = await getCfCredentials()
  if (!token) throw new Error("CF_API_TOKEN 未配置")

  const res = await fetch(`${CF_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
      ...options.headers,
    },
  })
  const data = await res.json() as { success: boolean; errors?: Array<{ code: number; message: string }>; result?: unknown }
  if (!data.success) {
    const errMsg = data.errors?.map(e => `[${e.code}] ${e.message}`).join('; ') || `HTTP ${res.status}`
    throw new Error(`CF API ${path}: ${errMsg}`)
  }
  return data.result
}

// 根据域名自动查找 Zone ID
export async function getZoneIdByName(domainName: string) {
  const result = await cfFetch(`/zones?name=${encodeURIComponent(domainName)}&status=active`) as Array<{ id: string; name: string }>
  if (!result || result.length === 0) {
    throw new Error(`在 Cloudflare 中未找到域名 ${domainName}，请确认该域名已添加到 CF`)
  }
  return result[0].id
}

// 启用域名的 Email Routing
export async function enableEmailRouting(zoneId: string) {
  return cfFetch(`/zones/${zoneId}/email/routing/enable`, { method: "POST", body: "{}" })
}

// 创建 catch-all 路由规则，转发到 Worker
export async function createCatchAllRule(zoneId: string, workerName: string) {
  return cfFetch(`/zones/${zoneId}/email/routing/rules/catch_all`, {
    method: "PUT",
    body: JSON.stringify({
      enabled: true,
      name: "MoeMail catch-all",
      actions: [{ type: "worker", value: [workerName] }],
    }),
  })
}

// 创建特定地址的路由规则
export async function createAddressRule(zoneId: string, address: string, workerName: string) {
  return cfFetch(`/zones/${zoneId}/email/routing/rules`, {
    method: "POST",
    body: JSON.stringify({
      enabled: true,
      name: `MoeMail route: ${address}`,
      matchers: [{ type: "literal", field: "to", value: address }],
      actions: [{ type: "worker", value: [workerName] }],
    }),
  })
}

// 获取所有路由规则
export async function listRoutingRules(zoneId: string) {
  return cfFetch(`/zones/${zoneId}/email/routing/rules`)
}

// 删除路由规则
export async function deleteRoutingRule(zoneId: string, ruleId: string) {
  return cfFetch(`/zones/${zoneId}/email/routing/rules/${ruleId}`, { method: "DELETE" })
}

// 为子域添加 Email Routing 所需的 DNS 记录
// 使用 CF 官方 Email Routing DNS API，让 CF 自动生成正确的 MX + TXT 记录
export async function setupSubdomainDns(zoneId: string, subdomain: string) {
  // CF 提供的 Email Routing DNS 端点，传入子域名前缀
  // 该 API 会自动创建正确的 MX + TXT 记录
  const parts = subdomain.split('.')
  const subdomainPrefix = parts[0] // e.g. "mail" from "mail.ishalumi.me"

  // 先尝试用 Email Routing 的子域 API
  try {
    await cfFetch(`/zones/${zoneId}/email/routing/dns`, {
      method: "POST",
      body: JSON.stringify({ name: subdomainPrefix }),
    })
    return
  } catch {
    // 如果专用 API 不存在，手动添加 DNS 记录
  }

  // 回退：手动创建 MX + TXT 记录
  const mxServers = [
    { content: "route1.mx.cloudflare.net", priority: 70 },
    { content: "route2.mx.cloudflare.net", priority: 88 },
    { content: "route3.mx.cloudflare.net", priority: 50 },
  ]

  for (const mx of mxServers) {
    await cfFetch(`/zones/${zoneId}/dns/records`, {
      method: "POST",
      body: JSON.stringify({
        type: "MX",
        name: subdomain,
        content: mx.content,
        priority: mx.priority,
        ttl: 1,
      }),
    })
  }

  await cfFetch(`/zones/${zoneId}/dns/records`, {
    method: "POST",
    body: JSON.stringify({
      type: "TXT",
      name: subdomain,
      content: "v=spf1 include:_spf.mx.cloudflare.net ~all",
      ttl: 1,
    }),
  })
}
