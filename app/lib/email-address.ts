const ANGLE_ADDRESS_PATTERN = /<\s*([^<>\s@]+@[^<>\s@]+)\s*>/
const BARE_ADDRESS_PATTERN = /([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+)/i

export function formatSenderAddress(raw?: string | null): string {
  const value = raw?.trim()
  if (!value) return ''

  const address = value.match(ANGLE_ADDRESS_PATTERN)?.[1]
    || value.match(BARE_ADDRESS_PATTERN)?.[1]
  if (!address) return value

  const at = address.lastIndexOf('@')
  const localPart = address.slice(0, at)
  const domain = address.slice(at + 1).toLowerCase()
  const generatedLocalPart =
    /^[a-f0-9]{24,}$/i.test(localPart) ||
    /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(localPart) ||
    /^[a-z0-9_-]{40,}$/i.test(localPart)

  return generatedLocalPart ? `noreply@${domain}` : address
}
