import semver from 'semver'
import type { Packument, VersionManifest } from '@/lib/npm'
import { getAllVersions } from '@/lib/npm'
import type { PackageAuditReport } from '@/lib/audit'
import {
  normalizeStableRangeDisplay,
  summarizeAffectedVersionRange,
} from '@/lib/audit/ranges'
import type { DependencySection } from './types'
import type { ResolutionContext } from './pass-context'

interface RootSource {
  name: string
  version: string
  section: DependencySection
}

interface GraphNode {
  name: string
  version: string
  manifest: VersionManifest
  roots: Map<string, RootSource>
}

interface VulnerabilityRootAssessment {
  root: RootSource
  safeAcrossStableVersions: boolean
}

function getNodeKey(name: string, version: string): string {
  return `${name}@${version}`
}

function getRootLabel(ctx: ResolutionContext, source: RootSource, kind: 'deprecated' | 'vulnerability'): string {
  const declared = ctx.pkg[source.section]?.[source.name]
  const displayVersion = kind === 'vulnerability'
    ? normalizeStableRangeDisplay(declared ?? source.version)
    : source.version
  return `${source.name}@${displayVersion}`
}

function getRootDeclaredRange(ctx: ResolutionContext, source: RootSource): string {
  return ctx.pkg[source.section]?.[source.name] ?? source.version
}

function getRequirementEntries(manifest: VersionManifest): Array<[string, string]> {
  return [
    ...Object.entries(manifest.dependencies ?? {}),
    ...Object.entries(manifest.optionalDependencies ?? {}),
  ]
}

async function resolveChildNode(
  ctx: ResolutionContext,
  name: string,
  range: string,
): Promise<Pick<GraphNode, 'name' | 'version' | 'manifest'> | null> {
  if (!semver.validRange(range)) {
    return null
  }

  const existing = ctx.states.get(name)
  if (existing && semver.satisfies(existing.currentVersion, range, { includePrerelease: true })) {
    return { name, version: existing.currentVersion, manifest: existing.manifest }
  }

  const analysis = await ctx.getInstallTargetAnalysis(name, range)
  const version = analysis.latestEngineCompatibleVersion ?? analysis.latestSatisfyingVersion
  if (!version) {
    return null
  }

  const packument = await ctx.getPackumentCached(name)
  const manifest = packument.versions[version]
  return manifest ? { name, version, manifest } : null
}

async function buildDependencyGraph(ctx: ResolutionContext): Promise<Map<string, GraphNode>> {
  const graph = new Map<string, GraphNode>()
  const queue = Array.from(ctx.states.values())
    .filter(state => state.root)
    .map(state => ({
      node: {
        name: state.name,
        version: state.currentVersion,
        manifest: state.manifest,
        roots: new Map([[state.name, { name: state.name, version: state.currentVersion, section: state.section }]]),
      },
    }))

  while (queue.length > 0) {
    const current = queue.shift()?.node
    if (!current) {
      continue
    }

    const currentKey = getNodeKey(current.name, current.version)
    const existing = graph.get(currentKey)
    const roots = existing?.roots ?? new Map<string, RootSource>()
    let changed = !existing
    for (const [key, value] of current.roots) {
      if (!roots.has(key)) {
        roots.set(key, value)
        changed = true
      }
    }

    if (!changed) {
      continue
    }

    graph.set(currentKey, { ...current, roots: new Map(roots) })
    for (const [dependencyName, dependencyRange] of getRequirementEntries(current.manifest)) {
      const child = await resolveChildNode(ctx, dependencyName, dependencyRange)
      if (!child) {
        continue
      }
      queue.push({ node: { ...child, roots: new Map(roots) } })
    }
  }

  return graph
}

async function getAffectedRange(report: PackageAuditReport, packument: Packument): Promise<string | null> {
  const ranges = report.advisories.flatMap(advisory => advisory.affectedRanges)
  if (ranges.length === 0) {
    return null
  }

  const affected = getAllVersions(packument).filter(version => (
    semver.valid(version)
    && !semver.prerelease(version)
    && ranges.some(range => semver.satisfies(version, range, { includePrerelease: true }))
  ))

  return summarizeAffectedVersionRange(affected)
}

export async function collectAdditionalAuditDetails(
  ctx: ResolutionContext,
  getReport: (name: string, version: string) => Promise<PackageAuditReport>,
): Promise<{ details: string[]; warnings: number; recommendedRemovalNames: string[] }> {
  const graph = await buildDependencyGraph(ctx)
  const findings = new Map<string, {
    kind: 'deprecated' | 'vulnerability'
    subject: string
    via: Set<string>
  }>()
  const recommendedRemovalNames = new Set<string>()
  const rootSafetyCache = new Map<string, boolean>()

  async function rootVersionAvoidsAffectedTarget(
    packageName: string,
    version: string,
    targetName: string,
    affectedRanges: string[],
    seen: Set<string> = new Set(),
  ): Promise<boolean> {
    const key = `${packageName}@${version}|${targetName}|${affectedRanges.join(',')}`
    if (seen.has(key)) {
      return true
    }
    seen.add(key)

    const packument = await ctx.getPackumentCached(packageName)
    const manifest = packument.versions[version]
    if (!manifest) {
      return true
    }

    for (const [dependencyName, dependencyRange] of getRequirementEntries(manifest)) {
      const child = await resolveChildNode(ctx, dependencyName, dependencyRange)
      if (!child) {
        continue
      }

      if (
        child.name === targetName
        && affectedRanges.some(range => semver.satisfies(child.version, range, { includePrerelease: true }))
      ) {
        return false
      }

      if (!await rootVersionAvoidsAffectedTarget(child.name, child.version, targetName, affectedRanges, seen)) {
        return false
      }
    }

    return true
  }

  async function assessRootSafety(
    root: RootSource,
    targetName: string,
    affectedRanges: string[],
  ): Promise<VulnerabilityRootAssessment> {
    const declaredRange = getRootDeclaredRange(ctx, root)
    const cacheKey = `${root.name}|${declaredRange}|${targetName}|${affectedRanges.join(',')}`
    const cached = rootSafetyCache.get(cacheKey)
    if (cached != null) {
      return { root, safeAcrossStableVersions: cached }
    }

    const packument = await ctx.getPackumentCached(root.name)
    const stableVersions = ctx.getSortedStableVersions(packument)
      .filter(version => semver.satisfies(version, declaredRange, { includePrerelease: true }))
    let safeAcrossStableVersions = false

    for (const version of stableVersions) {
      if (await rootVersionAvoidsAffectedTarget(root.name, version, targetName, affectedRanges)) {
        safeAcrossStableVersions = true
        break
      }
    }

    rootSafetyCache.set(cacheKey, safeAcrossStableVersions)
    return { root, safeAcrossStableVersions }
  }

  for (const node of graph.values()) {
    const viaLabels = Array.from(node.roots.values())
      .filter(source => source.name !== node.name)
      .map(source => source)

    if (node.manifest.deprecated?.trim() && viaLabels.length > 0) {
      const finding = findings.get(`deprecated:${node.name}`) ?? {
        kind: 'deprecated',
        subject: `${node.name} (deprecated)`,
        via: new Set<string>(),
      }
      for (const source of viaLabels) {
        finding.via.add(getRootLabel(ctx, source, 'deprecated'))
      }
      findings.set(`deprecated:${node.name}`, finding)
    }

    const report = await getReport(node.name, node.version)
    if (!report || report.advisories.length === 0 || viaLabels.length === 0) {
      continue
    }

    const packument = await ctx.getPackumentCached(node.name)
    const affectedRange = await getAffectedRange(report, packument)
    const affectedRanges = report.advisories.flatMap(advisory => advisory.affectedRanges)
    const subject = affectedRange ? `${node.name}@${affectedRange}` : `${node.name}@${node.version}`
    const key = `vulnerability:${node.name}:${affectedRange ?? node.version}`
    const finding = findings.get(key) ?? {
      kind: 'vulnerability',
      subject: `${subject} (vulnerability)`,
      via: new Set<string>(),
    }
    for (const source of viaLabels) {
      finding.via.add(getRootLabel(ctx, source, 'vulnerability'))
    }
    findings.set(key, finding)

    if (affectedRanges.length > 0) {
      const assessments = await Promise.all(viaLabels.map(source => assessRootSafety(source, node.name, affectedRanges)))
      for (const assessment of assessments) {
        if (!assessment.safeAcrossStableVersions) {
          recommendedRemovalNames.add(assessment.root.name)
        }
      }
    }
  }

  const ordered = Array.from(findings.values())
    .map(finding => ({
      kind: finding.kind,
      text: `${finding.subject} via ${Array.from(finding.via).sort((left, right) => left.localeCompare(right)).join(' & ')}`,
    }))
    .sort((left, right) => left.text.localeCompare(right.text))
  return {
    details: ordered.map(entry => entry.text),
    warnings: ordered.length,
    recommendedRemovalNames: Array.from(recommendedRemovalNames).sort((left, right) => left.localeCompare(right)),
  }
}
