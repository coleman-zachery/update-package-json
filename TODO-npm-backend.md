# Backend Architecture Plan: npm Package Status + Usage Service

## Goal

Build a small backend service, hosted on Railway, that supports a GitHub Pages frontend.

The frontend is hosted at:
https://coleman-zachery.github.io/update-package-json/

The backend should provide:
- npm package metadata/status checks
- cached dependency fingerprints
- package popularity/usage counters
- CORS access limited to the GitHub Pages app
- basic abuse protection

---

## High-Level Architecture

Frontend:
- Static GitHub Pages app
- No backend logic
- Calls Railway API with `fetch()`

Backend:
- Railway-hosted Node/Express or similar API
- Talks to npm registry
- Normalizes package metadata
- Computes package fingerprints
- Caches results
- Stores usage counters
- Returns JSON to frontend

Data store:
- Start simple with Railway Postgres, Redis, or SQLite if persistent storage is available
- Recommended:
  - Redis for cache/rate limiting
  - Postgres for durable usage stats
- Simpler MVP:
  - Postgres only

---

## Core Backend Responsibilities

### 1. CORS Restriction

Allow browser requests only from:
https://coleman-zachery.github.io

Reject or omit CORS headers for other origins.

Important note:
CORS is not real API security. It only restricts browser-based cross-origin requests. The API can still be called directly by scripts, curl, Postman, etc.

So the backend should also include:
- rate limiting
- request validation
- response caching
- optional lightweight API key later
- bot/abuse monitoring

---

## Proposed API Endpoints

### Health Check

GET /health

Purpose:
- confirm backend is online
- useful for Railway monitoring
- frontend can use this for status display

Response:
- ok
- service version
- uptime
- timestamp

---

### Package Status Check

GET /api/package/:name

Purpose:
Fetch and return normalized npm package status for one dependency.

Example:
GET /api/package/react

Returns:
- package name
- latest version
- dist integrity
- shasum if available
- modified timestamp
- peerDependencies
- dependency fingerprint hash
- cache status
- fetchedAt timestamp

Backend behavior:
1. Validate package name
2. Check cache
3. If cached and fresh, return cached result
4. If not cached, fetch npm registry metadata
5. Extract stable fields
6. Normalize fields
7. Compute fingerprint hash
8. Save result to cache
9. Increment package lookup counter
10. Return normalized JSON

---

### Batch Package Status Check

POST /api/packages/status

Purpose:
Check multiple dependencies at once.

Request body:
- dependencies array
- optional package manager field
- optional node version field
- optional includePeerDeps boolean

Backend behavior:
1. Validate body
2. Limit number of packages per request
3. Deduplicate dependency names
4. Resolve packages concurrently with a safe concurrency limit
5. Return array of package status results
6. Include errors per package instead of failing the entire batch

Useful for:
- analyzing package.json
- reducing frontend request spam
- improving cache hit rate

---

### Usage Stats

GET /api/usage

Purpose:
Return public popularity metrics for the app.

Possible response fields:
- total lookups
- total package.json analyses
- unique packages checked
- most checked packages
- last updated timestamp

Do not expose:
- IP addresses
- raw user identifiers
- sensitive request logs

---

### Increment App Usage

POST /api/usage/event

Purpose:
Track app usage events.

Event types:
- app_loaded
- package_checked
- package_json_analyzed
- result_copied
- error_seen

Backend behavior:
1. Validate event type
2. Apply rate limiting
3. Store aggregate counter
4. Do not store unnecessary personal data

For MVP, this endpoint can simply increment counters.

---

## Fingerprint Strategy

npm does not provide a built-in command like:
npm hash-check <dependency>

Instead, create a deterministic fingerprint from stable npm metadata.

Recommended fields:
- package name
- latest version
- dist.integrity
- dist.shasum
- time.modified
- peerDependencies
- engines
- deprecated flag/message if present

Normalize the metadata before hashing:
- sort object keys
- remove volatile fields
- use consistent JSON formatting
- handle missing values consistently

Example conceptual fingerprint:
react|19.1.0|sha512-...|2025-05-01T12:34:56Z|peerDepsHash

Use SHA-256 for the final fingerprint hash.

Purpose:
- detect package changes cheaply
- avoid recomputing dependency analysis when nothing changed
- support fast status checks from the frontend
- make cache invalidation predictable

---

## Cache Strategy

Use cache entries keyed by package name and version/tag.

Example cache keys:
- package:react:latest
- package:react:19.1.0
- fingerprint:react:latest

Recommended TTL:
- package metadata: 5–30 minutes
- usage stats: 30–120 seconds
- npm error responses: short TTL, around 30–60 seconds

Cache behavior:
- return cached package data when fresh
- refresh stale data in request path for MVP
- optionally add background refresh later
- cache failed npm responses briefly to prevent repeated registry hits

---

## Database / Storage Plan

### Tables

packages_cache:
- id
- package_name
- version
- dist_integrity
- dist_shasum
- modified_at
- peer_dependencies_json
- engines_json
- deprecated_message
- fingerprint_hash
- normalized_metadata_json
- fetched_at
- expires_at

usage_counters:
- id
- event_name
- count
- updated_at

package_lookup_counts:
- id
- package_name
- count
- last_checked_at

request_events optional:
- id
- event_name
- package_name nullable
- created_at
- coarse_source optional
- user_agent_hash optional

For privacy, avoid storing raw IP addresses unless needed for rate limiting. If needed, hash or truncate them.

---

## Rate Limiting

Add basic rate limits from the beginning.

Suggested limits:
- GET /api/package/:name: moderate limit per IP
- POST /api/packages/status: stricter limit
- POST /api/usage/event: strict but forgiving
- GET /api/usage: generous because it is read-only

Also enforce:
- max package name length
- max batch size
- request body size limit
- timeout for npm registry requests
- safe concurrency limits

---

## npm Registry Fetching

Use npm registry endpoint:
https://registry.npmjs.org/{package-name}

For scoped packages:
@scope/name must be URL encoded.

Backend should handle:
- missing package
- deprecated package
- npm registry timeout
- malformed package names
- rate limiting from upstream
- scoped package names
- packages without dist.integrity
- packages with unusual metadata

---

## Security Notes

CORS should allow only:
https://coleman-zachery.github.io

But CORS alone is not enough.

Add:
- rate limiting
- request size limits
- package name validation
- npm request timeout
- input sanitization
- structured error responses
- no secrets exposed to frontend
- no npm auth token unless absolutely necessary

Do not put private API keys in the GitHub Pages app.

---

## Environment Variables

Recommended env vars:
- PORT
- NODE_ENV
- ALLOWED_ORIGIN
- DATABASE_URL
- REDIS_URL optional
- NPM_REGISTRY_URL
- CACHE_TTL_SECONDS
- RATE_LIMIT_WINDOW_MS
- RATE_LIMIT_MAX_REQUESTS

Example:
ALLOWED_ORIGIN=https://coleman-zachery.github.io
NPM_REGISTRY_URL=https://registry.npmjs.org

---

## Suggested Implementation Stack

MVP:
- Node.js
- Express or Fastify
- Railway
- Postgres
- node-fetch or undici
- zod for validation
- cors middleware
- express-rate-limit or equivalent
- crypto for SHA-256 hashing

Alternative:
- Hono
- Fastify
- Bun
- Deno

Recommended simple path:
Node.js + Express + Postgres.

---

## MVP Build Order

1. Create Railway backend project
2. Add Express server
3. Add /health endpoint
4. Configure CORS for GitHub Pages origin
5. Add package name validation
6. Implement npm registry fetch
7. Normalize package metadata
8. Generate SHA-256 fingerprint
9. Add GET /api/package/:name
10. Add Postgres persistence/cache
11. Add usage counters
12. Add GET /api/usage
13. Add POST /api/packages/status
14. Add rate limiting
15. Connect frontend fetch calls to Railway URL
16. Add frontend display for:
   - backend online/offline
   - cache hit/miss
   - package fingerprint
   - latest version
   - peer dependency warnings
   - app usage stats

---

## Frontend Integration Plan

GitHub Pages frontend should call the Railway API.

Frontend config:
- store backend base URL in one constant
- avoid hardcoding endpoint paths throughout the app
- show loading/error states
- gracefully handle backend downtime
- cache recent frontend results in localStorage if useful

Example frontend states:
- Backend online
- Checking package
- Cache hit
- Cache refreshed
- npm registry unavailable
- Package not found
- Rate limited

---

## Future Enhancements

Potential later features:
- dependency graph analysis
- peer dependency conflict detection
- package.json migration suggestions
- npm dist-tag comparison
- package freshness score
- security advisory integration
- GitHub repo link extraction
- package popularity trend
- background refresh jobs
- admin stats dashboard
- API key support
- per-session anonymous usage tracking
- public leaderboard of most checked packages

---

## Success Criteria

The backend is successful when:
- GitHub Pages frontend can call it reliably
- only the intended browser origin is allowed by CORS
- npm metadata is fetched and normalized
- package fingerprints are deterministic
- repeated checks are cached
- usage counters are public and fast
- abuse is limited by rate limiting
- frontend can show popularity/status data without needing its own backend
