import type { ReactNode } from 'react'
import './index.css'

const REPOSITORY_URL = 'https://github.com/coleman-zachery/update-package-json'

interface Props {
  utility?: ReactNode
}

export function AppHeader({ utility }: Props) {
  return (
    <header className="app-header">
      <div className="app-header__row">
        <div>
          <h1 className="app-header__title">
            <a
              className="app-header__title-link"
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
            >
              <span className="app-header__glyph" aria-hidden="true">
                <span className="app-header__brace">{'{'}</span>
                <span className="app-header__arrow">↑</span>
                <span className="app-header__brace">{'}'}</span>
              </span>
              <span>update-package-json</span>
              <span className="app-header__title-link-arrow" aria-hidden="true">↗</span>
            </a>
          </h1>
          <p className="app-header__subtitle">
            Paste a package.json to resolve upgrades, overrides, engines, peers, and audit-safe versions.
          </p>
        </div>
        {utility ? (
          <div className="app-header__utility">
            {utility}
          </div>
        ) : null}
      </div>
    </header>
  )
}
