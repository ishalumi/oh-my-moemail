import { NextResponse } from "next/server"
import { headers } from "next/headers"

export const USER_ID_HEADER = "X-User-Id"
export const USER_ROLES_HEADER = "X-User-Roles"

export interface RequestIdentity {
  userId: string
  roles: string[]
}

/**
 * 中间件放行请求：先剥掉客户端可能伪造的身份头，再写入已校验的身份。
 * 下游路由直接读头，不必再次 auth() / 查角色表。
 */
export function forwardWithIdentity(request: Request, identity?: RequestIdentity) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.delete(USER_ID_HEADER)
  requestHeaders.delete(USER_ROLES_HEADER)

  if (identity) {
    requestHeaders.set(USER_ID_HEADER, identity.userId)
    requestHeaders.set(USER_ROLES_HEADER, identity.roles.join(","))
  }

  return NextResponse.next({ request: { headers: requestHeaders } })
}

/** 读取中间件转发的身份；没有经过中间件（或未携带角色）时返回 null。 */
export async function getForwardedIdentity(): Promise<RequestIdentity | null> {
  const headersList = await headers()
  const userId = headersList.get(USER_ID_HEADER)
  const roles = headersList.get(USER_ROLES_HEADER)
  if (!userId || roles === null) return null
  return { userId, roles: roles ? roles.split(",") : [] }
}
