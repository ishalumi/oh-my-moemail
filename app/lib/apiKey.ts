import { createDb } from "./db"
import { apiKeys } from "./schema"
import { eq, and, gt } from "drizzle-orm"
import { NextResponse } from "next/server"
import { auth } from "./auth"
import { forwardWithIdentity, getForwardedIdentity, type RequestIdentity } from "./request-identity"

async function getIdentityByApiKey(key: string): Promise<RequestIdentity | null> {
  const db = createDb()
  const apiKey = await db.query.apiKeys.findFirst({
    where: and(
      eq(apiKeys.key, key),
      eq(apiKeys.enabled, true),
      gt(apiKeys.expiresAt, new Date())
    ),
    with: {
      user: {
        columns: { id: true },
        with: { userRoles: { with: { role: { columns: { name: true } } } } }
      }
    }
  })

  if (!apiKey?.user?.id) return null

  return {
    userId: apiKey.user.id,
    roles: apiKey.user.userRoles.map(ur => ur.role.name),
  }
}

export async function handleApiKeyAuth(request: Request, apiKey: string, pathname: string) {
  if (!pathname.startsWith('/api/emails') && !pathname.startsWith('/api/config') && !pathname.startsWith('/api/domains')) {
    return NextResponse.json(
      { error: "无权限查看" },
      { status: 403 }
    )
  }

  const identity = await getIdentityByApiKey(apiKey)
  if (!identity) {
    return NextResponse.json(
      { error: "无效的 API Key" },
      { status: 401 }
    )
  }

  return forwardWithIdentity(request, identity)
}

export const getUserId = async () => {
  const forwarded = await getForwardedIdentity()
  if (forwarded) return forwarded.userId

  const session = await auth()

  return session?.user.id
}
