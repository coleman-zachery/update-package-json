export type ResolverModule = typeof import('@/lib/resolver')

let resolverModulePromise: Promise<ResolverModule> | null = null

export function loadResolverModule(): Promise<ResolverModule> {
  resolverModulePromise ??= import('@/lib/resolver')
  return resolverModulePromise
}
