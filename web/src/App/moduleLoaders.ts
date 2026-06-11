export type ResolverModule = typeof import('@/lib/resolver')
export type NpmModule = typeof import('@/lib/npm')

let resolverModulePromise: Promise<ResolverModule> | null = null
let npmModulePromise: Promise<NpmModule> | null = null

export function loadResolverModule(): Promise<ResolverModule> {
  resolverModulePromise ??= import('@/lib/resolver')
  return resolverModulePromise
}

export function loadNpmModule(): Promise<NpmModule> {
  npmModulePromise ??= import('@/lib/npm')
  return npmModulePromise
}
