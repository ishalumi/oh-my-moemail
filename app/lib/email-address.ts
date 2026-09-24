const ANGLE_ADDRESS_PATTERN = /<\s*([^<>\s@]+@[^<>\s@]+)\s*>/
const BARE_ADDRESS_PATTERN = /([A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+)/i

export function formatSenderAddress(raw?: string | null): string {
  const value = raw?.trim()
  if (!value) return ''

  const address = value.match(ANGLE_ADDRESS_PATTERN)?.[1]
    || value.match(BARE_ADDRESS_PATTERN)?.[1]
  return address || value
}
