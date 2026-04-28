import './index.css'

const REPOSITORY_URL = 'https://github.com/coleman-zachery/update-package-json'

export function AppHeader() {
  return (
    <header className="app-header">
      <div className="app-header__row">
        <div>
          <h1 className="app-header__title">
            <span className="app-header__glyph" aria-hidden="true">
              <span className="app-header__brace">{'{'}</span>
              <span className="app-header__arrow">↑</span>
              <span className="app-header__brace">{'}'}</span>
            </span>
            <span>update-package-json</span>
          </h1>
          <p className="app-header__subtitle">
            Paste a package.json to resolve upgrades, overrides, engines, peers, and audit-safe versions.
          </p>
        </div>
        <a
          className="app-header__link"
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
        >
          View source
        </a>
      </div>
    </header>
  )
}
