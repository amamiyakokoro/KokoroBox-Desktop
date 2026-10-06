/** Accept only the loopback PAC endpoint owned by Service. */
export function validateServicePacUrl(value: unknown): string {
  if (!value || typeof value !== 'object') throw new Error('Invalid Service PAC response')
  const url = (value as { url?: unknown }).url
  if (typeof url !== 'string') throw new Error('Invalid Service PAC response')
  const parsed = new URL(url)
  if (
    parsed.protocol !== 'http:' ||
    parsed.hostname !== '127.0.0.1' ||
    !parsed.port ||
    parsed.pathname !== '/pac' ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  )
    throw new Error('Invalid Service PAC endpoint')
  return parsed.href
}
