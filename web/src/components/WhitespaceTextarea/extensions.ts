import { Decoration, EditorView, WidgetType } from '@codemirror/view'
import { EditorState, RangeSetBuilder, type Extension } from '@codemirror/state'
import { getTextReplacement, syncPackageJsonAfterInputChange } from '@/lib/package-json'
import type { SpaceIndentSize } from '@/lib/indentation'

export interface TextareaMarker {
  key: string
  line: number
  checked: boolean
  title: string
  onToggle: () => void
}

const MARKER_SCROLL_SCALE_FALLBACK = 16
const STALE_DEPENDENCY_SECTIONS = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'overrides',
])

const STALE_DEPENDENCY_COLOR = '#ff6b72'

class MarkerWidget extends WidgetType {
  constructor(private readonly markers: TextareaMarker[]) {
    super()
  }

  eq(other: MarkerWidget): boolean {
    return this.markers.length === other.markers.length && this.markers.every((marker, index) => {
      const candidate = other.markers[index]
      return Boolean(candidate)
        && marker.key === candidate.key
        && marker.checked === candidate.checked
        && marker.title === candidate.title
    })
  }

  toDOM(view: EditorView): HTMLElement {
    const group = document.createElement('span')
    group.className = 'cm-line-marker-group'

    group.addEventListener('wheel', event => {
      const wheelEvent = event as WheelEvent
      const computedStyle = window.getComputedStyle(view.scrollDOM)
      const lineHeight = Number.parseFloat(computedStyle.lineHeight) || MARKER_SCROLL_SCALE_FALLBACK
      const pageHeight = view.scrollDOM.clientHeight || lineHeight
      const scale = wheelEvent.deltaMode === 1 ? lineHeight : wheelEvent.deltaMode === 2 ? pageHeight : 1

      view.scrollDOM.scrollBy({
        left: wheelEvent.deltaX * scale,
        top: wheelEvent.deltaY * scale,
        behavior: 'auto',
      })

      wheelEvent.preventDefault()
    }, { passive: false })

    for (const marker of this.markers) {
      const label = document.createElement('label')
      label.className = 'ws-marker cm-line-marker'
      label.title = marker.title

      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      checkbox.className = 'ws-marker__checkbox'
      checkbox.checked = marker.checked
      checkbox.setAttribute('aria-label', marker.title)
      checkbox.tabIndex = -1

      checkbox.addEventListener('click', event => {
        event.stopPropagation()
      })

      checkbox.addEventListener('mousedown', event => {
        event.stopPropagation()
      })

      checkbox.addEventListener('change', event => {
        event.stopPropagation()
        marker.onToggle()
      })

      label.appendChild(checkbox)
      group.appendChild(label)
    }

    return group
  }

  ignoreEvent(): boolean {
    return true
  }
}

export function createMarkerExtension(markers: TextareaMarker[]): Extension {
  if (markers.length === 0) {
    return []
  }

  const markersByLine = new Map<number, TextareaMarker[]>()

  for (const marker of markers) {
    const current = markersByLine.get(marker.line) ?? []
    current.push(marker)
    markersByLine.set(marker.line, current)
  }

  return EditorView.decorations.of(view => {
    const builder = new RangeSetBuilder<Decoration>()

    for (const [lineIndex, lineMarkers] of markersByLine) {
      if (lineIndex < 0 || lineIndex >= view.state.doc.lines) {
        continue
      }

      const line = view.state.doc.line(lineIndex + 1)
      builder.add(
        line.to,
        line.to,
        Decoration.widget({
          widget: new MarkerWidget(lineMarkers),
          side: 1,
        }),
      )
    }

    return builder.finish()
  })
}

export function createPackageJsonSyncExtension(
  spaceIndentSize?: SpaceIndentSize,
): Extension {
  return EditorState.transactionFilter.of(transaction => {
    if (!transaction.docChanged) {
      return transaction
    }

    const previousRaw = transaction.startState.doc.toString()
    const nextRaw = transaction.newDoc.toString()
    const syncedRaw = syncPackageJsonAfterInputChange(previousRaw, nextRaw, spaceIndentSize)
    const replacement = getTextReplacement(nextRaw, syncedRaw)

    if (!replacement) {
      return transaction
    }

    return [
      transaction,
      {
        changes: replacement,
        sequential: true,
      },
    ]
  })
}

export function createStaleDependencyHighlightExtension(
  staleDependencyNames: string[],
): Extension {
  if (staleDependencyNames.length === 0) {
    return []
  }

  const staleNames = new Set(staleDependencyNames)
  const staleTheme = EditorView.baseTheme({
    '.cm-stale-dependency-version, .cm-stale-dependency-version span': {
      color: `${STALE_DEPENDENCY_COLOR} !important`,
    },
  })

  const staleDecorations = EditorView.decorations.of(view => {
    const builder = new RangeSetBuilder<Decoration>()
    let currentSection: string | null = null

    for (let lineNumber = 1; lineNumber <= view.state.doc.lines; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber)
      const text = line.text

      const sectionMatch = text.match(/^\s*"([^"]+)"\s*:\s*{\s*$/)
      if (sectionMatch) {
        currentSection = STALE_DEPENDENCY_SECTIONS.has(sectionMatch[1]) ? sectionMatch[1] : null
        continue
      }

      if (/^\s*},?\s*$/.test(text)) {
        currentSection = null
        continue
      }

      if (!currentSection) {
        continue
      }

      const valueMatch = text.match(/^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/)
      if (!valueMatch) {
        continue
      }

      const [, name, version] = valueMatch
      if (!staleNames.has(name)) {
        continue
      }

      const colonIndex = text.indexOf(':')
      const versionToken = `"${version}"`
      const valueStart = text.indexOf(versionToken, colonIndex)
      if (valueStart < 0) {
        continue
      }

      builder.add(
        line.from + valueStart,
        line.from + valueStart + versionToken.length,
        Decoration.mark({
          class: 'cm-stale-dependency-version',
          attributes: {
            style: `color: ${STALE_DEPENDENCY_COLOR} !important;`,
          },
        }),
      )
    }

    return builder.finish()
  })

  return [staleTheme, staleDecorations]
}
