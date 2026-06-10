export const OSV_QUERY_BATCH_URL = 'https://api.osv.dev/v1/querybatch'
export const AUDIT_CACHE_TTL_MS = 60 * 60 * 1000
export const AUDIT_BATCH_SIZE = 100

export function getAuditCacheKey(name: string, version: string): string {
  return `osv-audit:${name}@${version}`
}

export function getRequestKey(name: string, version: string): string {
  return `${name}@${version}`
}
