import { extractPlatformSuffix } from './platform-targets'

function getScopedPackageParts(name: string): { scopeName: string; packageName: string } | null {
  if (!name.startsWith('@')) {
    return null
  }

  const slashIndex = name.indexOf('/')
  if (slashIndex <= 1 || slashIndex === name.length - 1) {
    return null
  }

  return {
    scopeName: name.slice(1, slashIndex),
    packageName: name.slice(slashIndex + 1),
  }
}

export function inferCompanionPackageName(name: string): string | null {
  const parts = getScopedPackageParts(name)
  if (!parts) {
    return null
  }

  const { scopeName, packageName } = parts
  if (packageName === scopeName) {
    return scopeName
  }

  const suffix = extractPlatformSuffix(name)
  if (!suffix) {
    return null
  }

  if (packageName === suffix) {
    return scopeName
  }

  const prefix = packageName.endsWith(`-${suffix}`)
    ? packageName.slice(0, -(suffix.length + 1))
    : ''

  if (!prefix) {
    return null
  }

  if (prefix === scopeName || prefix === 'binding') {
    return scopeName
  }

  return prefix.includes('/') ? null : `@${scopeName}/${prefix}`
}
