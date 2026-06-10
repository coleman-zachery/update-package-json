import type { PlatformSupport } from '@/lib/resolver'

interface Props {
  platformSupport: PlatformSupport
}

function formatList(values: string[]): string {
  return values.join(', ')
}

function summarizeTargets(values: string[], maxItems = 4): string {
  if (values.length <= maxItems) {
    return formatList(values)
  }

  return `${formatList(values.slice(0, maxItems))}, +${values.length - maxItems} more`
}

export function PlatformTargetsSection({ platformSupport }: Props) {
  if (platformSupport.availableTargets.length === 0) {
    return null
  }

  return (
    <section className="summary-section summary-section--warn platform-targets">
      <h3>Platform optional dependencies</h3>
      <p className="audit-summary__meta">
        Native optional dependency families were detected. The global platform selectors in the
        toolbar determine which family member should be carried into the output package.json.
      </p>
      {platformSupport.selectedTargets.length > 0 ? (
        <p className="platform-targets__hint">
          Resolved targets: {formatList(platformSupport.selectedTargets)}
        </p>
      ) : null}
      {platformSupport.inferredTargets.length > 0 ? (
        <p className="platform-targets__hint">
          Already present in the package set: {formatList(platformSupport.inferredTargets)}
        </p>
      ) : null}
      <div className="platform-targets__families">
        {platformSupport.families.map(family => (
          <div key={family.dependencyName} className="platform-targets__family">
            <p className="platform-targets__family-title">
              <span className="summary-line__name">{family.dependencyName}</span>
              {' '}
              publishes optional native builds via
              {' '}
              <span className="summary-line__peer-source">{summarizeTargets(family.optionalDependencyNames, 2)}</span>
            </p>
            <p className="platform-targets__hint">
              Available targets: {summarizeTargets(family.availableTargets)}
            </p>
            {family.selectedTargets.length > 0 ? (
              <p className="platform-targets__hint">
                Auto-resolved to: {formatList(family.selectedTargets)}
              </p>
            ) : null}
            {family.issues.map(issue => (
              <p
                key={`${family.dependencyName}:${issue.source}:${issue.requested}`}
                className="platform-targets__hint platform-targets__hint--warn"
              >
                {issue.source === 'toolbar'
                  ? `Toolbar selection ${issue.requested}`
                  : `Existing package target ${issue.requested}`}
                {' '}
                {issue.reason === 'ambiguous' ? 'matched multiple family members' : 'did not match any family member'}
                {issue.candidates.length > 0
                  ? `: ${summarizeTargets(issue.candidates)}`
                  : '.'}
              </p>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
