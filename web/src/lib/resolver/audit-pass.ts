import { fetchPackageAuditReports, type PackageAuditReport } from '@/lib/audit'
import { isAbortError } from './abort'
import { collectAdditionalAuditDetails } from './audit-findings'
import { createUnavailableAuditStatus, formatAuditFinding } from './messages'
import { setStateVersion, syncPeerGraph } from './pass-state'
import { stabilizeResolutionGraph } from './pass-conflicts'
import type { AuditStatus, PackageState } from './types'
import type { ResolutionContext } from './pass-context'

function createAuditManager(ctx: ResolutionContext) {
  const reports = new Map<string, PackageAuditReport>()
  const getKey = (name: string, version: string) => `${name}@${version}`

  return {
    async prefetch(requests: Array<{ name: string; version: string }>) {
      const uncached = requests.filter(({ name, version }) => !reports.has(getKey(name, version)))
      if (uncached.length === 0) return
      for (const [key, report] of await fetchPackageAuditReports(uncached, ctx.signal)) reports.set(key, report)
    },
    async get(name: string, version: string) {
      const key = getKey(name, version)
      if (!reports.has(key)) await this.prefetch([{ name, version }])
      const report = reports.get(key)
      if (!report) throw new Error(`Missing audit report for ${name}@${version}`)
      return report
    },
  }
}

async function findLatestSafeCandidate(audit: ReturnType<typeof createAuditManager>, state: PackageState): Promise<string | null> {
  const candidateVersions = Array.from(new Set(state.candidateVersions))
  await audit.prefetch(candidateVersions.map(version => ({ name: state.name, version })))
  for (const candidateVersion of candidateVersions) {
    if ((await audit.get(state.name, candidateVersion)).advisories.length === 0) return candidateVersion
  }
  return null
}

function buildAuditStatus(ctx: ResolutionContext, reports: Array<{ state: PackageState; report: PackageAuditReport }>): AuditStatus {
  const blockedNames = new Set<string>()
  const blocked: string[] = []
  const residual: string[] = []
  for (const { state, report } of reports) {
    if (report.advisories.length === 0) continue
    if (ctx.isStateRestricted(state)) {
      blockedNames.add(state.name)
      blocked.push(`${formatAuditFinding(report)}. Unfreeze the package or remove its override to allow an audit-safe version.`)
    } else {
      residual.push(`${formatAuditFinding(report)}. No audit-safe version was found within the current engine and peer constraints.`)
    }
  }
  if (blocked.length > 0) {
    return { state: 'failure', summary: `${blocked.length} vulnerable package${blocked.length === 1 ? '' : 's'} remain because they are frozen by current restrictions or overrides`, details: [...blocked, ...residual], warnings: residual.length, vulnerabilities: blocked.length, recommendedUnfreezeNames: Array.from(blockedNames).sort((left, right) => left.localeCompare(right)), recommendedRemovalNames: [] }
  }
  if (residual.length > 0) {
    return { state: 'warning', summary: `${residual.length} package${residual.length === 1 ? '' : 's'} still have known advisories under the current engine or peer constraints`, details: residual, warnings: residual.length, vulnerabilities: 0, recommendedUnfreezeNames: [], recommendedRemovalNames: [] }
  }
  return { state: 'pass', summary: '0 vulnerabilities and 0 warnings', details: [], warnings: 0, vulnerabilities: 0, recommendedUnfreezeNames: [], recommendedRemovalNames: [] }
}

function appendAdditionalDetails(
  base: AuditStatus,
  additional: { details: string[]; warnings: number; recommendedRemovalNames: string[] },
): AuditStatus {
  if (additional.details.length === 0) {
    if (additional.recommendedRemovalNames.length === 0) {
      return base
    }
    return {
      ...base,
      recommendedRemovalNames: additional.recommendedRemovalNames,
    }
  }

  const details = [...base.details, ...additional.details]
  const warnings = base.warnings + additional.warnings
  const vulnerabilities = base.vulnerabilities

  if (base.state === 'failure') {
    return {
      ...base,
      details,
      warnings,
      recommendedRemovalNames: additional.recommendedRemovalNames,
      summary: `${vulnerabilities} vulnerable package${vulnerabilities === 1 ? '' : 's'} and ${warnings} warning${warnings === 1 ? '' : 's'} remain`,
    }
  }

  return {
    ...base,
    state: 'warning',
    details,
    warnings,
    recommendedRemovalNames: additional.recommendedRemovalNames,
    summary: `${vulnerabilities} vulnerabilities and ${warnings} warning${warnings === 1 ? '' : 's'}`,
  }
}

export async function runAuditPass(ctx: ResolutionContext): Promise<AuditStatus> {
  const audit = createAuditManager(ctx)
  try {
    ctx.throwIfAborted()
    await audit.prefetch(Array.from(ctx.states.values()).map(state => ({ name: state.name, version: state.currentVersion })))
    for (let pass = 0; pass < 200; pass++) {
      ctx.throwIfAborted()
      let changed = false
      const orderedStates = Array.from(ctx.states.values()).sort((left, right) => {
        if (left.root !== right.root) return left.root ? -1 : 1
        if (ctx.isStateRestricted(left) !== ctx.isStateRestricted(right)) return ctx.isStateRestricted(left) ? 1 : -1
        return left.name.localeCompare(right.name)
      })
      for (const state of orderedStates) {
        ctx.throwIfAborted()
        const currentReport = await audit.get(state.name, state.currentVersion)
        if (currentReport.advisories.length === 0 || ctx.isStateRestricted(state)) continue
        const safeVersion = await findLatestSafeCandidate(audit, state)
        if (!safeVersion || safeVersion === state.currentVersion || !await setStateVersion(ctx, state.name, safeVersion)) continue
        await syncPeerGraph(ctx)
        await stabilizeResolutionGraph(ctx)
        await audit.prefetch(Array.from(ctx.states.values()).map(nextState => ({ name: nextState.name, version: nextState.currentVersion })))
        changed = true
        break
      }
      if (!changed) break
    }

    const finalStates = Array.from(ctx.states.values()).sort((left, right) => left.name.localeCompare(right.name))
    ctx.throwIfAborted()
    await audit.prefetch(finalStates.map(state => ({ name: state.name, version: state.currentVersion })))
    const reports = await Promise.all(
      finalStates.map(async state => ({ state, report: await audit.get(state.name, state.currentVersion) })),
    )
    const directStatus = buildAuditStatus(ctx, reports)
    const additional = await collectAdditionalAuditDetails(ctx, audit.get.bind(audit))
    return appendAdditionalDetails(directStatus, additional)
  } catch (error) {
    if (isAbortError(error)) {
      throw error
    }
    return createUnavailableAuditStatus(error instanceof Error ? error.message : String(error))
  }
}
