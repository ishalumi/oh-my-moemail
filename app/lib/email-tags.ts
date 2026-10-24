// 纯函数，前后端共用（不要在这里引入 drizzle 等服务端依赖）
const TAG_SEPARATOR = /[,，]/

export const UNTAGGED_KEY = "__untagged__"

export function parseTags(label: string | null | undefined): string[] {
  if (!label) return []
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of label.split(TAG_SEPARATOR)) {
    const tag = raw.trim()
    const key = tag.toLowerCase()
    if (!tag || seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
  }
  return tags
}
