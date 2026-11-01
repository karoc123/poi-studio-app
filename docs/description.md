Die aktualisierte `description.md` vereint das Basis-System mit sämtlichen Praxis-, UX- und Technik-Upgrades (Google-Maps-Link-Parser, mehrtägige Unterkünfte, OSRM-Distanzen, GPX/JSON-Export, Checkliste, Karten-Layer-Switcher und SQLite-WAL-Modus) sowie einem verbindlichen Phasenplan, damit der Coding-Agent das Projekt strukturiert und ohne Halluzinationen abarbeitet.

```markdown
# Project Specification: Collaborative Trip & POI Planner (Web-First)

## 1. Project Overview
Build a collaborative, web-first travel planning application where users can log in with a simple local account (username + optional password), create trips, invite friends via shareable links, and collaboratively collect, schedule, vote, and comment on Points of Interest (POIs) on an interactive Leaflet map.

The architecture must be lightweight and portable so it can run either self-hosted on a **Raspberry Pi** (using a local SQLite file in WAL mode) or serverless on **Vercel + Turso** (libSQL) with zero code changes.

---

## 2. Tech Stack & Core Libraries
- **Framework:** Next.js (App Router, TypeScript, Tailwind CSS) configured with `output: 'standalone'`.
- **Database & ORM:** SQLite / libSQL via `@libsql/client` and **Drizzle ORM** (`drizzle-orm`, `drizzle-kit`).
  - Local / Raspberry Pi: `file:./local.db` (with `PRAGMA journal_mode = WAL;` enabled).
  - Cloud (Vercel + Turso): `libsql://...` with `DATABASE_AUTH_TOKEN`.
- **Authentication:** Custom lightweight session authentication using `jose` (HTTP-only JWT cookies) and `bcryptjs` for optional password hashing. No external OAuth providers.
- **Map Engine:** `leaflet` and `react-leaflet` (strictly loaded via `next/dynamic` with `{ ssr: false }`).
- **Tile Layers (Built-in Switcher, No API Keys):**
  - *Clean (Default):* CartoDB Voyager (`https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png`)
  - *Standard:* OpenStreetMap (`https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`)
  - *Topo / Outdoor:* OpenTopoMap (`https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png`)
- **Geocoding & Routing (Keyless Open APIs):**
  - **Place Search & Reverse Geocoding:** Komoot Photon API (`https://photon.komoot.io/api/?q=...` & `https://photon.komoot.io/reverse?lon=...&lat=...`).
  - **Routing & Distance:** OSRM Public API (`https://router.project-osrm.org/route/v1/driving/...`) to calculate driving distance (km), duration (min), and route geometry between sequential day POIs, with a local Haversine formula fallback if OSRM is unreachable.
- **Icons & UI:** `lucide-react` for UI and category icons.
- **Data Fetching & Sync:** `swr` with 5-second background polling (`refreshInterval: 5000`) and **Optimistic UI updates** (`mutate`) for instant feedback on votes, status changes, checklists, and sorting.

---

## 3. Database Schema (Drizzle ORM - `src/db/schema.ts`)

### `users`
- `id`: text (Primary Key, UUID)
- `username`: text (Unique, Not Null)
- `passwordHash`: text (Nullable — if null, user logs in with username only)
- `avatarColor`: text (Not Null, hex color assigned on creation)
- `createdAt`: integer (Timestamp)

### `trips`
- `id`: text (Primary Key, UUID)
- `title`: text (Not Null)
- `description`: text (Nullable)
- `startDate`: text (Nullable, ISO date `YYYY-MM-DD`)
- `endDate`: text (Nullable, ISO date `YYYY-MM-DD`)
- `inviteCode`: text (Unique, Not Null, 10-char URL-safe slug)
- `createdById`: text (Foreign Key -> `users.id`)
- `createdAt`: integer (Timestamp)

### `trip_members`
- `id`: text (Primary Key, UUID)
- `tripId`: text (Foreign Key -> `trips.id`, Cascade Delete)
- `userId`: text (Foreign Key -> `users.id`, Cascade Delete)
- `role`: text (`'OWNER' | 'EDITOR' | 'VIEWER'`, default `'EDITOR'`)
- `joinedAt`: integer (Timestamp)
- *Constraint:* Unique composite index on `(tripId, userId)`.

### `pois`
- `id`: text (Primary Key, UUID)
- `tripId`: text (Foreign Key -> `trips.id`, Cascade Delete)
- `createdById`: text (Foreign Key -> `users.id`)
- `title`: text (Not Null)
- `lat`: real (Not Null)
- `lng`: real (Not Null)
- `address`: text (Nullable)
- `category`: text (`'ACCOMMODATION' | 'FOOD' | 'SIGHTSEEING' | 'NATURE' | 'TRANSPORT' | 'OTHER'`, default `'SIGHTSEEING'`)
- `status`: text (`'IDEA' | 'PLANNED' | 'BOOKED'`, default `'IDEA'`)
- `dayStart`: integer (Nullable, e.g., `1`, `2`, `3` representing Day 1, Day 2...)
- `dayEnd`: integer (Nullable — primarily for `ACCOMMODATION` spanning multiple days, e.g., `dayStart: 1, dayEnd: 4`. For single-day POIs, `dayEnd` is null or equals `dayStart`.)
- `timeSlot`: text (Nullable, free-form time string e.g. `'09:30 - 11:30'` or `'Check-in 15:00'`)
- `orderIndex`: integer (Default `0`, used for ordering POIs within a day)
- `notes`: text (Nullable)
- `externalUrl`: text (Nullable)
- `estimatedCost`: real (Nullable, default `0`)
- `createdAt`: integer (Timestamp)

### `poi_votes`
- `id`: text (Primary Key, UUID)
- `poiId`: text (Foreign Key -> `pois.id`, Cascade Delete)
- `userId`: text (Foreign Key -> `users.id`, Cascade Delete)
- *Constraint:* Unique composite index on `(poiId, userId)`.

### `poi_comments`
- `id`: text (Primary Key, UUID)
- `poiId`: text (Foreign Key -> `pois.id`, Cascade Delete)
- `userId`: text (Foreign Key -> `users.id`, Cascade Delete)
- `content`: text (Not Null)
- `createdAt`: integer (Timestamp)

### `trip_checklists`
- `id`: text (Primary Key, UUID)
- `tripId`: text (Foreign Key -> `trips.id`, Cascade Delete)
- `text`: text (Not Null)
- `isCompleted`: integer (Boolean mode `0` or `1`, default `0`)
- `assignedToUserId`: text (Nullable, Foreign Key -> `users.id`)
- `createdById`: text (Foreign Key -> `users.id`)
- `createdAt`: integer (Timestamp)

---

## 4. Core Features & Detailed User Flows

### 4.1 Local Auth Flow (`/login`) & Profile Security
- Single form with `Username` (required) and `Password` (optional).
- **Auto-Registration & Login Logic:**
  1. If `username` does not exist: create a new user (hash password with `bcryptjs` if provided, otherwise store `passwordHash: null`) and issue session cookie.
  2. If `username` exists and `passwordHash` is `null`: log user in immediately without password check.
  3. If `username` exists and `passwordHash` is set: require matching password via `bcryptjs.compare`.
- **Profile Modal:** Logged-in users can set, change, or remove their password at any time from the header bar.

### 4.2 Dashboard (`/`) & JSON Backup Restore
- Displays all trips the user belongs to with dates, member count, and POI count.
- **Create Trip Modal:** Title, Description, Start Date, End Date.
- **Join via Invite Code:** Input field for invite code or full invite URL.
- **Import Trip Backup (JSON):** Upload a previously exported `.json` trip file to recreate a full trip including all POIs and checklist items under the current user as `OWNER`.

### 4.3 Invite System (`/join/[inviteCode]`)
- If unauthenticated, redirect to `/login?redirect=/join/[inviteCode]`.
- Once authenticated, add user to `trip_members` as `'EDITOR'` (if not already a member) and redirect to `/trips/[tripId]`.
- Trip `OWNER` can change member roles (`EDITOR` <-> `VIEWER`) or remove members in a "Members Modal". `VIEWER` users have read-only access (cannot add/edit/delete POIs or checklists).

### 4.4 Main Trip Workspace (`/trips/[tripId]`) — Web-First Split Screen
#### Top Header Bar
- Trip title, date range, member avatars, total estimated cost sum (`€`), "Copy Invite Link" button, and an **Export Menu**:
  - **Export JSON Backup:** Full lossless dump of trip, POIs, comments, and checklists.
  - **Export GPX:** Standard `.gpx` file containing all POIs (`<wpt>`) and planned day routes (`<trk>`) for offline navigation apps (Organic Maps, Garmin, Komoot).
  - **Export GeoJSON:** Standard `.geojson` FeatureCollection for Google My Maps / uMap.

#### Left Sidebar (420px–480px on Desktop, Bottom Sheet / Tab View on Mobile)
Contains two main top-level tabs: **1. Route & POIs** and **2. Checkliste**.

**Tab 1: Route & POIs**
- **Smart Search & Coordinate / Google Maps Link Parser:**
  - Single search bar at the top.
  - **Smart Detection:** If the user pastes a Google Maps URL (e.g., `https://www.google.com/maps/place/.../@48.8584,2.2945,17z...` or `?q=48.8584,2.2945`) or raw coordinates (`48.8584, 2.2945`), extract `lat`, `lng`, and any URL-encoded place name via regex immediately without hitting Photon. Fly map to coordinates and open the "Add POI" dialog.
  - **Standard Search:** Otherwise, query Photon API with debounce (300ms) and show autocomplete suggestions.
- **Filter & Day Bar:**
  - Horizontal pill selector: `All`, `Unassigned (Ideas)`, `Day 1`, `Day 2`, ... (automatically calculated from trip `startDate`/`endDate` or highest assigned day + "+ Add Day" button).
  - Secondary filter for Status (`All`, `IDEA`, `PLANNED`, `BOOKED`) and Category.
- **Multi-Day Accommodation Pinning:**
  - When viewing a specific day `D`, any POI with `category === 'ACCOMMODATION'` where `dayStart <= D && (dayEnd >= D || dayStart === D)` is automatically displayed at the top of Day `D` as **"Unterkunft / Startpunkt"** so users see where they wake up and start their daily route.
- **POI List & Reordering:**
  - Each POI card displays: Sequential number badge (if a specific day is active), Title, Category icon/color, Status pill, `timeSlot` badge, `estimatedCost`, Creator avatar, Upvote button + count, and Comment count.
  - **Ordering:** When viewing a specific day, provide quick Up/Down reorder buttons (or drag-and-drop) that update `orderIndex` optimistically via `SWR`.
- **Distance & Travel Time Connectors:**
  - When viewing a specific day, render a subtle connector line between sequential POI cards showing the distance (`km`) and driving/walking time (`min`) calculated via OSRM (with Haversine straight-line distance fallback).

**Tab 2: Checkliste (Group Todo & Packing List)**
- Simple, fast collaborative checklist for the trip (e.g., "Mietwagen buchen", "Reisepass prüfen").
- Users can add items, toggle completion (`isCompleted`), optionally assign an item to a trip member, and delete items.

#### Right Interactive Map (Remaining Viewport Width & 100% Height)
- **Layer Switcher Control:** Floating toggle in the top-right corner to switch between *CartoDB Voyager (Clean)*, *OpenStreetMap Standard*, and *OpenTopoMap*.
- **Click-to-Pin:** Clicking on the map (when "Pin Mode" is active or via right-click context menu) drops a temporary marker, runs Photon reverse geocoding (`https://photon.komoot.io/reverse?lon={lng}&lat={lat}`) to prefill the address/name, and opens the "Add POI" form.
- **Custom SVG Markers (`L.divIcon`):**
  - Color-coded by `category`.
  - When a specific day is selected, render the sequential order number (`1`, `2`, `3`...) directly inside the marker badge.
  - `IDEA` POIs render slightly smaller with a dashed border; `PLANNED` and `BOOKED` POIs render solid and prominent.
- **Route Polyline:**
  - When a specific day (or "All Planned") is active, draw a polyline connecting that day's POIs in `orderIndex` sequence (using OSRM route geometry if available, otherwise a dashed geodesic line).
- **Smart Auto-Bounds (`fitBounds`):**
  - Automatically fit map bounds (`map.fitBounds`) to visible POIs **only** on initial trip load or when the user actively changes the selected Day/Category filter. **Never** trigger `fitBounds` on background 5-second SWR polling updates so the user's manual map panning/zooming is never interrupted.
- **Direct External Navigation Links:**
  - Every POI popup and detail modal includes 1-click deep links:
    - *Google Maps:* `https://www.google.com/maps/search/?api=1&query={lat},{lng}`
    - *Apple Maps:* `https://maps.apple.com/?ll={lat},{lng}&q={encodedTitle}`
    - *Geo URI (Organic Maps / OsmAnd):* `geo:{lat},{lng}?q={lat},{lng}({encodedTitle})`

---

## 5. Strict Implementation Guardrails for the Coding Agent

1. **Leaflet SSR Protection:**
   - Never import `leaflet` or `react-leaflet` at the top level of a Server Component or standard Client Component. Always wrap the map in an isolated `MapView.tsx` client component and load it via `next/dynamic(() => import('@/components/MapView'), { ssr: false })`.
   - Import `'leaflet/dist/leaflet.css'` inside the client map component or global CSS.
2. **Custom `L.divIcon` Only:**
   - Do not use default Leaflet PNG markers (`L.Icon.Default`), as their image paths break in Next.js builds. Build clean HTML/SVG markers using `L.divIcon` with Tailwind classes.
3. **Database Initialization & SQLite WAL Mode (`src/db/index.ts`):**
   ```ts
   import { drizzle } from 'drizzle-orm/libsql';
   import { createClient } from '@libsql/client';
   import * as schema from './schema';

   const url = process.env.DATABASE_URL || 'file:./local.db';

   export const client = createClient({
     url,
     authToken: process.env.DATABASE_AUTH_TOKEN,
   });

   // Enable WAL mode for local SQLite file (critical for Raspberry Pi SD-card performance & concurrency)
   if (url.startsWith('file:')) {
     client.execute('PRAGMA journal_mode = WAL;').catch(console.error);
     client.execute('PRAGMA busy_timeout = 5000;').catch(console.error);
   }

   export const db = drizzle(client, { schema });

```

4. **Google Maps Link & Coordinate Parser Helper (`src/lib/geoParser.ts`):**
* Implement a dedicated utility that tests input strings against:
* Raw coords: `/^\s*(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)\s*$/`
* Google Maps `@lat,lng`: `/@(-?\d+\.\d+),(-?\d+\.\d+)/`
* Google Maps `?q=lat,lng` or `!3dlat!4dlng`: `/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/`


* Also extract place name from `/maps/place/([^/]+)/` using `decodeURIComponent(match[1].replace(/\+/g, ' '))`.


5. **Recommended Implementation Order:**
* **Phase 1:** Initialize Next.js project, dependencies, Drizzle schema (`src/db/schema.ts`), and DB connection with WAL mode. Push schema (`npx drizzle-kit push`).
* **Phase 2:** Build JWT Session Auth (`jose` + `bcryptjs`), `/login` page, and Profile password modal.
* **Phase 3:** Build REST API routes for Trips, Invite joining, POIs (CRUD + Reorder), Votes, Comments, Checklists, and JSON Import/Export.
* **Phase 4:** Build the `MapView` component with `react-leaflet`, Layer Switcher, custom SVG numbered `divIcon` markers, Click-to-Pin, and OSRM/Haversine polyline routing.
* **Phase 5:** Assemble the Split-Screen Trip Workspace (`/trips/[tripId]`) with SWR 5s polling, optimistic mutations, Photon + Google Maps URL search bar, and GPX/GeoJSON/JSON export utilities.