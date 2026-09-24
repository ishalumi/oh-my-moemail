import { NextResponse } from "next/server"
import { createDb } from "@/lib/db"
import { emails, messages } from "@/lib/schema"
import { eq, and, lt, or, sql, ne, isNull, desc } from "drizzle-orm"
import { encodeCursor, decodeCursor } from "@/lib/cursor"
import { getUserId } from "@/lib/apiKey"
import { checkBasicSendPermission } from "@/lib/send-permissions"

export const runtime = "edge"

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()

  try {
    const db = createDb()
    const { id } = await params
    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId!)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "邮箱不存在或无权限删除" },
        { status: 403 }
      )
    }
    await db.delete(messages)
      .where(eq(messages.emailId, id))

    await db.delete(emails)
      .where(eq(emails.id, id))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete email:', error)
    return NextResponse.json(
      { error: "删除邮箱失败" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getUserId()

  try {
    const db = createDb()
    const { id } = await params
    const { label } = await request.json<{ label?: string }>()

    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId!)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "无权限" },
        { status: 403 }
      )
    }

    await db.update(emails)
      .set({ label: label?.trim() || null })
      .where(eq(emails.id, id))

    return NextResponse.json({
      success: true,
      email: { id, label: label?.trim() || null }
    })
  } catch (error) {
    console.error('Failed to update email label:', error)
    return NextResponse.json(
      { error: "更新备注失败" },
      { status: 500 }
    )
  }
}

const PAGE_SIZE = 20

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { searchParams } = new URL(request.url)
  const cursorStr = searchParams.get('cursor')
  const messageType = searchParams.get('type')
  const summaryOnly = searchParams.get('summary') === '1'

  try {
    const db = createDb()
    const { id } = await params

    const userId = await getUserId()
    if (messageType === 'sent') {
      const permissionResult = await checkBasicSendPermission(userId!)
      if (!permissionResult.canSend) {
        return NextResponse.json(
          { error: permissionResult.error || "您没有查看发送邮件的权限" },
          { status: 403 }
        )
      }
    }

    const email = await db.query.emails.findFirst({
      where: and(
        eq(emails.id, id),
        eq(emails.userId, userId!)
      )
    })

    if (!email) {
      return NextResponse.json(
        { error: "无权限查看" },
        { status: 403 }
      )
    }

    const baseConditions = and(
      eq(messages.emailId, id),
      messageType === 'sent' 
        ? eq(messages.type, "sent") 
        : or(
            ne(messages.type, "sent"),
            isNull(messages.type)
          )
    )

    const totalResult = await db.select({ count: sql<number>`count(*)` })
      .from(messages)
      .where(baseConditions)
    const totalCount = Number(totalResult[0].count)

    const conditions = [baseConditions]

    if (cursorStr) {
      const { timestamp, id } = decodeCursor(cursorStr)
      const orderByTime = messageType === 'sent' ? messages.sentAt : messages.receivedAt
      conditions.push(
        or(
          lt(orderByTime, new Date(timestamp)),
          and(
            eq(orderByTime, new Date(timestamp)),
            lt(messages.id, id)
          )
        )
      )
    }

    const orderByTime = messageType === 'sent' ? messages.sentAt : messages.receivedAt

    if (summaryOnly) {
      const results = await db
        .select({
          id: messages.id,
          sender: messages.sender,
          recipient: messages.recipient,
          subject: messages.subject,
          receivedAt: messages.receivedAt,
          sentAt: messages.sentAt,
        })
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(orderByTime), desc(messages.id))
        .limit(PAGE_SIZE + 1)

      const hasMore = results.length > PAGE_SIZE
      const messageList = hasMore ? results.slice(0, PAGE_SIZE) : results
      const nextCursor = hasMore
        ? encodeCursor(
            messageType === 'sent'
              ? messageList[PAGE_SIZE - 1].sentAt!.getTime()
              : messageList[PAGE_SIZE - 1].receivedAt.getTime(),
            messageList[PAGE_SIZE - 1].id
          )
        : null

      return NextResponse.json({
        messages: messageList.map(msg => ({
          id: msg.id,
          sender: msg.sender,
          recipient: msg.recipient,
          subject: msg.subject,
          sentAt: msg.sentAt?.getTime(),
          receivedAt: msg.receivedAt.getTime()
        })),
        nextCursor,
        total: totalCount
      })
    }

    const results = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy: (messages, { desc }) => [
        desc(orderByTime),
        desc(messages.id)
      ],
      limit: PAGE_SIZE + 1
    })
    
    const hasMore = results.length > PAGE_SIZE
    const nextCursor = hasMore 
      ? encodeCursor(
          messageType === 'sent' 
            ? results[PAGE_SIZE - 1].sentAt!.getTime()
            : results[PAGE_SIZE - 1].receivedAt.getTime(),
          results[PAGE_SIZE - 1].id
        )
      : null
    const messageList = hasMore ? results.slice(0, PAGE_SIZE) : results

    return NextResponse.json({
      messages: messageList.map(msg => ({
        id: msg.id,
        sender: msg.sender,
        recipient: msg.recipient,
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        sentAt: msg.sentAt?.getTime(),
        receivedAt: msg.receivedAt?.getTime()
      })),
      nextCursor,
      total: totalCount
    })
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    )
  }
} 