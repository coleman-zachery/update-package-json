import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ClipboardEvent as ReactClipboardEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import CodeMirror, { ExternalChange } from '@uiw/react-codemirror'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { json } from '@codemirror/lang-json'
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language'
import { EditorState, type Extension } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  highlightWhitespace,
  keymap,
  type ViewUpdate,
} from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { getEffectiveIndentStyle, getIndentText, type SpaceIndentSize } from '@/lib/indentation'
import {
  createInspectableDependencyExtension,
  createMajorBuildHighlightExtension,
  createMarkerExtension,
  createOverrideDependencyHighlightExtension,
  createPackageJsonSyncExtension,
  createPlatformDependencyHighlightExtension,
  createStaleDependencyHighlightExtension,
  createTransitiveDependencyHighlightExtension,
  createUnresolvedDependencyHighlightExtension,
  type TextareaMarker,
} from '@/components/WhitespaceTextarea/extensions'
import './index.css'

export type { TextareaMarker } from '@/components/WhitespaceTextarea/extensions'

interface Props {
  value: string
  ariaLabel: string
  onChange?: (value: string) => void
  onPasteCapture?: () => void
  placeholder?: string
  readOnly?: boolean
  spaceIndentSize?: SpaceIndentSize
  staleDependencyNames?: string[]
  markers?: TextareaMarker[]
  onInspectDependency?: (packageName: string) => void
  highlightMajorBuildVersions?: boolean
  overriddenDependencyNames?: string[]
  platformDependencyNames?: string[]
  transitiveDependencyNames?: string[]
  unresolvedDependencyNames?: string[]
}

const packageJsonHighlightStyle = HighlightStyle.define([
  { tag: [tags.propertyName, tags.string, tags.number, tags.bool, tags.null, tags.keyword], color: '#f2f0f7' },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: '#f2f0f7' },
])

export function WhitespaceTextarea({
  value,
  ariaLabel,
  onChange,
  onPasteCapture,
  placeholder,
  readOnly = false,
  spaceIndentSize,
  staleDependencyNames = [],
  markers = [],
  onInspectDependency,
  highlightMajorBuildVersions = false,
  overriddenDependencyNames = [],
  platformDependencyNames = [],
  transitiveDependencyNames = [],
  unresolvedDependencyNames = [],
}: Props) {
  const indentStyle = useMemo(
    () => getEffectiveIndentStyle(value, spaceIndentSize),
    [spaceIndentSize, value],
  )
  const editorViewRef = useRef<EditorView | null>(null)
  const pendingExternalScrollRef = useRef<{ top: number; left: number } | null>(null)
  const restoreScrollFrameRef = useRef<number | null>(null)

  const extensions = useMemo(() => {
    const configuredExtensions: Extension[] = [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
      json(),
      drawSelection(),
      highlightWhitespace(),
      EditorState.tabSize.of(indentStyle.size),
      indentUnit.of(getIndentText(indentStyle)),
      EditorView.contentAttributes.of({
        'aria-label': ariaLabel,
        spellcheck: 'false',
      }),
      syntaxHighlighting(packageJsonHighlightStyle),
    ]

    if (!readOnly) {
      configuredExtensions.push(createPackageJsonSyncExtension(spaceIndentSize))
    }

    if (staleDependencyNames.length > 0) {
      configuredExtensions.push(createStaleDependencyHighlightExtension(staleDependencyNames))
    }

    if (highlightMajorBuildVersions) {
      configuredExtensions.push(createMajorBuildHighlightExtension())
    }

    if (overriddenDependencyNames.length > 0) {
      configuredExtensions.push(createOverrideDependencyHighlightExtension(overriddenDependencyNames))
    }

    if (platformDependencyNames.length > 0) {
      configuredExtensions.push(createPlatformDependencyHighlightExtension(platformDependencyNames))
    }

    if (transitiveDependencyNames.length > 0) {
      configuredExtensions.push(createTransitiveDependencyHighlightExtension(transitiveDependencyNames))
    }

    if (unresolvedDependencyNames.length > 0) {
      configuredExtensions.push(createUnresolvedDependencyHighlightExtension(unresolvedDependencyNames))
    }

    if (!readOnly && markers.length > 0) {
      configuredExtensions.push(createMarkerExtension(markers))
    }

    if (onInspectDependency) {
      configuredExtensions.push(
        createInspectableDependencyExtension(onInspectDependency, unresolvedDependencyNames),
      )
    }

    return configuredExtensions
  }, [ariaLabel, highlightMajorBuildVersions, indentStyle.size, markers, onInspectDependency, overriddenDependencyNames, platformDependencyNames, readOnly, spaceIndentSize, staleDependencyNames, transitiveDependencyNames, unresolvedDependencyNames])

  useLayoutEffect(() => {
    const view = editorViewRef.current
    if (!view || view.state.doc.toString() === value) {
      return
    }

    pendingExternalScrollRef.current = {
      top: view.scrollDOM.scrollTop,
      left: view.scrollDOM.scrollLeft,
    }
  }, [value])

  useEffect(() => {
    return () => {
      if (restoreScrollFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreScrollFrameRef.current)
      }
    }
  }, [])

  function handleWheelCapture(event: ReactWheelEvent<HTMLDivElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement) || !target.closest('.ws-marker__checkbox')) {
      return
    }

    const scroller = target.closest('.cm-scroller')
    if (!(scroller instanceof HTMLElement)) {
      return
    }

    scroller.scrollBy({
      left: event.deltaX,
      top: event.deltaY,
      behavior: 'auto',
    })

    event.preventDefault()
  }

  function handlePasteCapture(_event: ReactClipboardEvent<HTMLDivElement>) {
    onPasteCapture?.()
  }

  function handleCreateEditor(view: EditorView) {
    editorViewRef.current = view
  }

  function handleUpdate(viewUpdate: ViewUpdate) {
    if (!pendingExternalScrollRef.current) {
      return
    }

    const didApplyExternalChange = viewUpdate.transactions.some(transaction => transaction.annotation(ExternalChange))
    if (!didApplyExternalChange) {
      return
    }

    const nextScrollPosition = pendingExternalScrollRef.current
    pendingExternalScrollRef.current = null

    if (restoreScrollFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreScrollFrameRef.current)
    }

    restoreScrollFrameRef.current = window.requestAnimationFrame(() => {
      viewUpdate.view.scrollDOM.scrollTo({
        top: nextScrollPosition.top,
        left: nextScrollPosition.left,
        behavior: 'auto',
      })
      restoreScrollFrameRef.current = null
    })
  }

  return (
    <div
      className={`ws-textarea${readOnly ? ' ws-textarea--readonly' : ''}`}
      onPasteCapture={handlePasteCapture}
      onWheelCapture={handleWheelCapture}
    >
      {placeholder && value.length === 0 ? (
        <div className="ws-textarea__placeholder" aria-hidden="true">
          {placeholder}
        </div>
      ) : null}
      <CodeMirror
        value={value}
        onChange={onChange}
        onCreateEditor={handleCreateEditor}
        onUpdate={handleUpdate}
        readOnly={readOnly}
        editable={!readOnly}
        basicSetup={false}
        indentWithTab={false}
        theme="none"
        height="100%"
        extensions={extensions}
        className="ws-codemirror"
      />
    </div>
  )
}
