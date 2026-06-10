import { AUDIT_CACHE_TTL_MS, getAuditCacheKey } from './constants'
import type { CachedAuditReport, PackageAuditReport } from './types'

export function readCachedReport(name: string, version: string): PackageAuditReport | null {
  try {
    const raw = localStorage.getItem(getAuditCacheKey(name, version))
    if (!raw) return null

    const cached = JSON.parse(raw) as CachedAuditReport
    if (Date.now() - cached.fetchedAt > AUDIT_CACHE_TTL_MS) {
      localStorage.removeItem(getAuditCacheKey(name, version))
      return null
    }

    return {
      name: cached.name,
      version: cached.version,
      advisories: cached.advisories,
    }
  } catch {
    return null
  }
}

export function writeCachedReport(report: PackageAuditReport) {
  try {
    const cached: CachedAuditReport = { ...report, fetchedAt: Date.now() }
    localStorage.setItem(getAuditCacheKey(report.name, report.version), JSON.stringify(cached))
  } catch {
    // localStorage full or unavailable
  }
}
