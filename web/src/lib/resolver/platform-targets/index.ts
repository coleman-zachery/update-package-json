import { DEFAULT_PLATFORM_SELECTION } from './constants'
import {
  extractPlatformSuffix,
  normalizePlatformSelection,
} from './helpers'
export { coercePlatformSelection, getPlatformSelectorState } from './selectors'
export { updatePlatformSelection } from './selectors'
export {
  reconcilePlatformTargets,
  reconcilePlatformTargetsDetailed,
  resolvePlatformSelection,
} from './resolution'

export { DEFAULT_PLATFORM_SELECTION, extractPlatformSuffix }
export { normalizePlatformSelection }
export type {
  PlatformOption,
  PlatformResolutionIssue,
  PlatformSelection,
} from './types'
