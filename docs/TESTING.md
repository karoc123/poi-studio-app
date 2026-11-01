# E2E Test Suite Infrastructure & Verification Guide

## 1. Overview & Architectural Philosophy

The E2E Test Suite for **Collaborative Trip & POI Planner (poi-studio-2)** is designed as an **opaque-box, requirement-driven, multi-tier automated test harness**. It treats the application as an opaque system accessible through standard HTTP interfaces and client contracts without coupling to internal private methods.

### Core Principles
1. **Zero Facade / High Integrity**: Tests exercise real HTTP networking, real database transactions with foreign-key cascades, real cryptographic primitives (`jose` JWT, `bcryptjs`), and real mathematical calculations (Haversine spherical distance, Nearest-Neighbor TSP heuristic). No tests hardcode dummy passes.
2. **Dual-Mode Target Flexibility**:
   - **Standalone Specification Reference Mode (Default)**: Tests run against an isolated in-memory reference server (`tests/harness/reference-server.js`) backed by `@libsql/client` (`:memory:`). This enables progressive verification immediately without blocking on late-stage UI integration.
   - **Live Production Mode**: Providing `--target=http://localhost:3000` (or setting `APP_URL`) executes the identical opaque-box test suite directly against the running Next.js App Router server.
3. **Progressive Testability**: Organized in four distinct test tiers allowing targeted verification during development milestones (M1 through M7).

---

## 2. Test Tiers & Coverage Matrix

| Tier | Category | Scope | Test Files | Tests |
|---|---|---|---|:---:|
| **Tier 1** | Feature Coverage | Primary happy-path coverage across all 6 core domains: Auth, Trips, RBAC, Map, Itinerary, Portability | `tests/tier1-feature/*.test.js` | **38** |
| **Tier 2** | Boundary & Corner Cases | Boundary limits, empty strings, null dates, coordinate bounds, expired tokens, role violations | `tests/tier2-boundary/*.test.js` | **34** |
| **Tier 3** | Cross-Feature Combinations | Pairwise interaction tests (RBAC + POIs, Hotel pinning + TSP routing, JSON export + re-import) | `tests/tier3-combination/*.test.js` | **6** |
| **Tier 4** | Real-World Scenarios | End-to-end multi-user workflows simulating real traveler journeys | `tests/tier4-scenario/*.test.js` | **3** |
| **Total** | | **Comprehensive Test Suite** | **14 test files** | **81** |

---

## 3. Directory Layout

```
tests/
├── runner.js                               # Standalone CLI test runner (entry point)
├── harness/
│   ├── client.js                           # TestApiClient (HTTP fetch wrapper with cookie jar)
│   ├── reference-server.js                 # HTTP reference server (LibSQL :memory:, jose, bcryptjs)
│   ├── geo-utils.js                        # Geospatial math (Haversine, TSP heuristic, URL regex)
│   └── test-env.js                         # Test environment lifecycle manager (start/cleanup)
├── tier1-feature/
│   ├── auth.test.js                        # 7 tests: auto-registration, passwordless, bcrypt, JWT
│   ├── trips.test.js                       # 6 tests: trip creation, dashboard metrics, clone, delete
│   ├── rbac.test.js                        # 6 tests: invite links, regenerate code, OWNER/EDITOR/VIEWER
│   ├── map.test.js                         # 7 tests: Google/Apple/OSM regex, Photon proxies, tiles
│   ├── itinerary.test.js                   # 8 tests: rich POI schema, hotel pinning, reorder, TSP
│   └── portability.test.js                 # 6 tests: JSON backup, GPX 1.1, GeoJSON, iCal, print view
├── tier2-boundary/
│   ├── auth-boundary.test.js               # 6 tests: whitespace trimming, tampered JWT, open redirect
│   ├── trips-boundary.test.js              # 5 tests: missing title, undated trips, non-owner delete
│   ├── rbac-boundary.test.js               # 5 tests: invalid invite code, duplicate join, sole owner
│   ├── map-boundary.test.js                # 5 tests: out-of-bounds coords, malformed URLs, 4s timeout
│   ├── itinerary-boundary.test.js          # 6 tests: TSP with 0/1 stop, date boundaries, double vote
│   └── portability-boundary.test.js        # 5 tests: corrupt JSON, fresh ID collision, XML escaping
├── tier3-combination/
│   └── cross-feature.test.js               # 6 tests: pairwise cross-feature coverage
└── tier4-scenario/
    └── real-world-scenarios.test.js        # 3 tests: complete real-world application user journeys
```

---

## 4. How to Run the Tests

### Quick Start
To execute all 81 tests across Tiers 1-4:
```bash
node tests/runner.js
```

### Targeted Tier Execution
Run a specific tier using the `--tier` flag:
```bash
# Run Tier 1 only (Feature Coverage)
node tests/runner.js --tier=1

# Run Tier 2 only (Boundary & Corner Cases)
node tests/runner.js --tier=2

# Run Tier 3 only (Cross-Feature Combinations)
node tests/runner.js --tier=3

# Run Tier 4 only (Real-World Scenarios)
node tests/runner.js --tier=4
```

### Running Against a Live Next.js Server
When the Next.js production or development server is running:
```bash
# Via CLI flag
node tests/runner.js --target=http://localhost:3000

# Or via environment variable
APP_URL=http://localhost:3000 node tests/runner.js
```

### Filtering Specific Test Files
```bash
node tests/runner.js --filter=auth
node tests/runner.js --filter=itinerary
```

### Listing Available Test Suites
```bash
node tests/runner.js --list
```

### Native Node.js Test Runner
You can also run all tests or individual files directly via Node.js:
```bash
node --test tests/**/*.test.js
node --test tests/tier1-feature/auth.test.js
```

---

## 5. Test Infrastructure Components

### 5.1 `TestApiClient` (`tests/harness/client.js`)
- Maintains an in-memory cookie jar across requests (automatically capturing and sending `auth_token`).
- Provides forkability (`client.fork()`) to simulate multiple concurrent users (e.g., Alice as OWNER, Bob as EDITOR, Charlie as VIEWER).
- Encapsulates typed helpers for all 28 API routes specified in `survey_specs.md`.

### 5.2 `ReferenceServer` (`tests/harness/reference-server.js`)
- Built using Node.js standard `node:http` and `@libsql/client` with `:memory:`.
- Configured with `PRAGMA foreign_keys = ON;` guaranteeing relational cascades on trip/POI deletions.
- Signs real HMAC-SHA256 tokens using `jose` with 30-day expiration.
- Uses `bcryptjs` for secure password hashing.
- Implements the exact REST contract from `survey_specs.md` §4.

### 5.3 `geo-utils.js` (`tests/harness/geo-utils.js`)
- Authoritative mathematical implementation of the spherical Haversine formula ($R = 6371.0088\text{ km}$).
- Nearest-Neighbor Traveling Salesperson (TSP) heuristic preserving accommodations as starting origin.
- Client-side regex engine parsing Google Maps, Apple Maps, OpenStreetMap URLs, and decimal coordinate strings.
- XML entity escaper for valid GPX 1.1 documents.

---

## 6. Expected Output Derivation

All expected values are strictly derived from authoritative documents:
1. **Authentication**: `docs/FEATURES.md` §1 & `survey_specs.md` §3 (30-day session cookies, bcrypt verification, passwordless mode).
2. **Trip & RBAC**: `docs/FEATURES.md` §2-§3 & `survey_specs.md` §4.2-§4.3 (OWNER/EDITOR/VIEWER permission matrix, 10-char invite codes).
3. **Map & Search**: `docs/FEATURES.md` §4-§5 & `survey_specs.md` §5-§6 (URL regex extraction, Photon search/reverse, keyless tiles).
4. **Itinerary & Routing**: `docs/FEATURES.md` §6-§9 & `survey_specs.md` §7 (Nearest-Neighbor TSP, Haversine fallback, pace alerts >10h).
5. **Data Portability**: `docs/FEATURES.md` §10 & `survey_specs.md` §8 (GPX 1.1, RFC 7946 GeoJSON, RFC 5545 iCalendar, print view).

---

## 7. Exit Codes & CI Integration

The automated runner (`tests/runner.js`) exits with:
- `0`: All tests passed cleanly.
- `1`: Any assertion or execution failure occurred.

This makes it directly pluggable into any CI/CD pipeline or verification gate:
```json
{
  "scripts": {
    "test": "node tests/runner.js",
    "test:tier1": "node tests/runner.js --tier=1",
    "test:tier2": "node tests/runner.js --tier=2",
    "test:tier3": "node tests/runner.js --tier=3",
    "test:tier4": "node tests/runner.js --tier=4"
  }
}
```
