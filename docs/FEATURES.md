# FEATURES.MD — Collaborative Trip & POI Planner

## 1. Authentication & User Profiles (Frictionless Local Auth)
- **Username + Optional Password Login (`/login`):**
  - Single unified login/registration screen requiring only a `username` and an optional `password`.
  - **Auto-Registration:** If the entered username does not exist in the database, automatically create the user account (hashing the password with `bcryptjs` if provided, or storing `passwordHash: null` if left blank) and sign them in immediately.
  - **Passwordless Convenience:** If an existing user has `passwordHash: null`, logging in with just their username signs them in immediately without prompting for a password.
  - **Password Protection:** If an existing user has set a password, verify it against `passwordHash` and show a clear error message if missing or incorrect.
- **Session Management:**
  - Stateless HTTP-only JWT cookies signed via `jose` (30-day expiration).
  - Support `?redirect=` query parameters so unauthenticated users clicking an invite link land directly in the trip after logging in.
- **User Profile Modal:**
  - Accessible from the top navigation bar at any time.
  - Users can set a password (if previously passwordless), change their existing password, or remove their password to revert to username-only login.
  - Users can customize their `avatarColor` (used for member badges, comment avatars, and map marker attribution).

---

## 2. Dashboard & Trip Management (`/`)
- **Trip Overview Grid:**
  - Displays all trips where the current user is a member, sorted by start date / last activity.
  - Each Trip Card shows: Title, description snippet, date range (`startDate` – `endDate`), total days badge, upcoming countdown (e.g., *"In 14 days"*), member avatar stack, total POI count (broken down by *Planned* vs. *Ideas*), and total estimated cost.
- **Trip Lifecycle Actions:**
  - **Create Trip:** Modal with Title (required), Description, Start Date, End Date, and default Currency symbol (`€`, `$`, `£`, `CHF`, `¥`).
  - **Edit Trip Settings:** Update title, dates, description, or currency at any time.
  - **Duplicate Trip (Template Mode):** Clone an existing trip's POIs and checklists into a new trip (resetting votes and booking statuses) to reuse itineraries.
  - **Delete Trip:** Restricted exclusively to the trip `OWNER` with a confirmation prompt.
- **General Trip Info & Scratchpad Modal:**
  - A shared markdown/text scratchpad per trip for storing general group information that is not tied to a single map pin (e.g., flight numbers, emergency contacts, rental car confirmation, Wi-Fi passwords, general packing notes).

---

## 3. Collaboration, Invite System & Roles
- **Shareable Invite Links (`/join/[inviteCode]`):**
  - Every trip generates a unique 10-character URL-safe `inviteCode`.
  - 1-click **"Copy Invite Link"** button in the trip header.
  - Visiting `/join/[inviteCode]` automatically adds the logged-in user to the trip as an `EDITOR` and redirects to `/trips/[tripId]`.
  - Trip owners can regenerate the `inviteCode` to invalidate old links.
- **Role-Based Access Control (RBAC):**
  - `OWNER`: Full control—can edit trip metadata, manage member roles, regenerate invite codes, delete the trip, and manage all POIs/checklists.
  - `EDITOR`: Standard collaborator—can add, edit, reorder, and delete POIs, vote, comment, and manage checklists.
  - `VIEWER`: Read-only guest—can browse the map, filter days, inspect POI details, and export files (GPX/ICS/Print), but cannot modify data.
- **Near-Realtime Synchronization & Optimistic UI:**
  - Active trip workspaces poll the backend every 5 seconds via `SWR` (`refreshInterval: 5000`).
  - All user interactions (upvoting, status toggling, checklist checking, reordering) use **Optimistic UI mutations** (`mutate`) so the interface reacts instantaneously without waiting for the network roundtrip.
  - Member avatars in the header display a subtle tooltip showing who belongs to the trip and allow the `OWNER` to open the **Member Management Modal**.

---

## 4. Interactive Map Engine (`react-leaflet`)
- **Multi-Layer Tile Switcher (Keyless Open-Source Maps):**
  - Floating layer selector in the top-right corner of the map supporting:
    1. **CartoDB Voyager (Default):** Clean, modern, high-contrast vector-like raster tiles where colored POI pins stand out clearly.
    2. **OpenStreetMap Standard:** Classic detailed street and shop view.
    3. **OpenTopoMap:** Topographic hiking and elevation map for nature/outdoor trips.
    4. **CartoDB Dark Matter:** Dark mode map tiles when dark theme is active.
- **Custom Category & Status SVG Markers (`L.divIcon`):**
  - Built purely with HTML/Tailwind/SVG (`L.divIcon`)—no broken default PNG icons.
  - **Color & Icon Coding:** Distinct colors and Lucide SVG icons per category:
    - `ACCOMMODATION` (Indigo / Bed icon)
    - `FOOD` (Orange / Utensils icon)
    - `SIGHTSEEING` (Emerald / Camera or Landmark icon)
    - `NATURE` (Green / Trees/Mountain icon)
    - `ACTIVITY` (Purple / Ticket/Compass icon)
    - `TRANSPORT` (Blue / Train/Plane/Car icon)
    - `NIGHTLIFE` (Pink / Wine/Music icon)
    - `OTHER` (Slate / MapPin icon)
  - **Visual Status Differentiation:**
    - `IDEA`: Slightly smaller marker with a dashed border and 80% opacity.
    - `PLANNED`: Solid, vibrant marker with white border and drop shadow.
    - `BOOKED`: Solid marker with a small checkmark badge.
  - **Sequential Day Numbering:** When filtering by a specific day (or itinerary mode), markers display their sequential stop number (`1`, `2`, `3`...) prominently inside the pin.
  - **Must-See Highlight:** POIs marked as `isMustSee` display a small gold star badge on the pin.
- **Bidirectional Map-Sidebar Synchronization:**
  - **Hover Sync:** Hovering over a POI card in the left sidebar highlights and scales up the corresponding marker on the map.
  - **Click Sync:** Clicking a POI card smoothly flies the map (`map.flyTo`) to those coordinates and opens the POI detail view.
- **Click-to-Pin & Context Menu:**
  - Users can click the **"Drop Pin on Map"** toggle button or **right-click anywhere on the map** to drop a marker at exact coordinates.
  - Automatically triggers reverse geocoding via Komoot Photon (`https://photon.komoot.io/reverse`) to pre-fill the place name and street address in the creation modal.
- **Smart Auto-Bounds (`fitBounds`):**
  - Automatically adjusts map zoom/bounds to frame all visible markers on initial load and whenever the user switches the Day or Category filter.
  - **Strict Guardrail:** Background 5-second SWR polling updates must NEVER trigger `fitBounds`, ensuring a user's manual map panning/zooming is never interrupted.
  - Includes a floating **"Fit All Visible Pins"** button on the map for manual recentering.

---

## 5. Smart Search & Universal URL / Coordinate Parser
- **Unified Search Input (`SmartSearchBar`):**
  - Located prominently at the top of the left sidebar.
- **Instant URL & Coordinate Extraction (Client-Side Regex Parser):**
  - Before calling any external API, inspect the input string for pasted map links or coordinates:
    - **Google Maps URLs:** Extract `@lat,lng`, `!3dlat!4dlng`, or `?q=lat,lng`, plus the URL-encoded place title from `/maps/place/([^/]+)/`.
    - **Apple Maps & OpenStreetMap URLs:** Extract `ll=lat,lng` or `#map=zoom/lat/lng`.
    - **Raw Coordinates:** Detect decimal coordinate pairs like `48.8584, 2.2945`.
  - When detected, display an instant **"Add from Link / Coordinates"** action that flies directly to the location and opens the pre-filled POI modal without needing an external search query.
- **Keyless Autocomplete Geocoding (Komoot Photon API):**
  - For regular text queries (e.g., *"Louvre Paris"*, *"Ramen Tokyo"*), query `https://photon.komoot.io/api/?q=...&limit=6` with a 300ms debounce.
  - Display rich dropdown suggestions showing Place Name, Street/City/Country, and OSM type badge.
  - Selecting a result flies the map to the location and opens the "Create POI" modal with title, address, and coordinates pre-filled.

---

## 6. Rich POI Management & Multi-Day Scheduling
- **Comprehensive POI Data Fields:**
  - `title` (required), `category`, `status` (`IDEA`, `PLANNED`, `BOOKED`), `isMustSee` (boolean priority flag).
  - `lat`, `lng`, `address`.
  - `dayStart` (nullable integer: `null` = Unassigned Idea Pool; `1..N` = Day 1..N).
  - `dayEnd` (nullable integer: used for multi-day stays like hotels/campsites).
  - `timeSlot` (optional string, e.g., `09:30 - 11:30` or `Check-in 15:00`).
  - `durationMinutes` (optional integer, e.g., `90` for 1.5 hours spent at location).
  - `transportMode` (`DRIVING`, `WALKING`, `CYCLING`, `TRANSIT` — defines how to route to the next stop).
  - `estimatedCost` (numeric amount), `costType` (`TOTAL` for group vs. `PER_PERSON`), `paidByUserId` (optional user who paid/booked), `bookingReference` (optional string for confirmation codes).
  - `externalUrl` (link to website, Booking.com, Airbnb, menu, or ticket page).
  - `notes` (multiline description/tips).
- **Multi-Day Accommodation Pinning (Smart Hotel Logic):**
  - An `ACCOMMODATION` POI can span multiple days (e.g., `dayStart: 1`, `dayEnd: 4`).
  - When viewing Day 1, Day 2, Day 3, or Day 4 in the sidebar, that accommodation is automatically pinned at the top of the day's list as **"Startpoint / Accommodation"** (and visually connected as the start of that day's route on the map) without having to duplicate the hotel entry for every single day.
- **1-Click External Navigation Deep Links:**
  - Every POI card/modal provides instant deep-link buttons for on-the-go mobile use:
    - **Google Maps:** `https://www.google.com/maps/search/?api=1&query={lat},{lng}`
    - **Google Maps Directions:** `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}`
    - **Apple Maps:** `https://maps.apple.com/?ll={lat},{lng}&q={title}`
    - **Geo URI (Organic Maps / OsmAnd / Komoot):** `geo:{lat},{lng}?q={lat},{lng}({title})`

---

## 7. Daily Routing, Distances & Auto-Optimization
- **OSRM Route Polylines & Haversine Fallback:**
  - When viewing a specific day, draw a route line connecting the day's ordered POIs (starting from the pinned Accommodation if present).
  - Query the free OSRM public API (`router.project-osrm.org`) to render the real road/walking geometry and compute exact distance (`km`) and travel duration (`min`) between consecutive stops.
  - If OSRM times out or the user selects straight-line transit, gracefully fall back to a dashed geodesic polyline and local Haversine distance/time estimation.
- **Leg Distance Connectors in Sidebar:**
  - Between POI Card #1 and POI Card #2 in a day view, display a compact timeline connector showing `🚗 14.2 km • ~22 min` (or `🚶 1.1 km • ~14 min`) plus a direct "Route on Google Maps" link for that specific leg.
- **Easy Reordering & Day Assignment:**
  - Up/Down reorder buttons (and drag-and-drop support) on POI cards to adjust `orderIndex` within a day.
  - Quick dropdown on every card to move a POI between `Unassigned (Ideas)` and `Day 1..N`.
- **1-Click "Optimize Day Route" (Nearest-Neighbor Solver):**
  - A button inside each Day header that automatically sorts all POIs of that day in the shortest geographical sequence (starting from the day's Accommodation or first stop) using a fast client-side Nearest-Neighbor algorithm.
- **Daily Workload & Pace Summary Bar:**
  - At the top of each selected Day, show a summary pill: Total stops, combined visit duration + driving time (e.g., *"5 Stops • 4h visits + 1h 45m driving"*), and a visual warning badge if a single day is overloaded (>10 hours total).

---

## 8. Social Decision Making: Voting, Comments & Budget
- **Idea Pool & Upvoting System:**
  - Every member can toggle an upvote (`👍` / `❤️`) on any POI.
  - Display the total vote count and a hover tooltip listing the names/avatars of members who voted for it.
  - **Sort by Popularity:** In the `All` or `Unassigned (Ideas)` view, users can sort POIs by *"Most Voted"* to quickly identify group favorites and schedule them into specific days.
- **POI Comment Threads:**
  - Each POI detail modal includes a chronological comment section where members can discuss details (e.g., *"Closed on Mondays!"*, *"I booked a table for 6 at 19:30"*).
  - Shows author avatar, username, relative timestamp, and delete button for own comments.
- **Budget & Cost Breakdown Modal:**
  - Clicking the total cost badge in the top bar opens a **Trip Budget Summary**:
    - Total Estimated Cost vs. Already Booked Cost.
    - Breakdown by Category (Accommodation, Food, Sightseeing, Transport, etc.).
    - Breakdown by Day.
    - Calculation of estimated cost per trip member.

---

## 9. Collaborative Checklists (Todos & Packing List)
- **Dedicated "Checklist" Sidebar Tab:**
  - Switch between **Route & POIs** and **Checklists** in the sidebar.
- **Categorized Group Lists:**
  - Support three built-in categories: `BEFORE_TRIP` (Bookings & To-Dos), `PACKING` (Group Packing Equipment), and `DOCUMENTS` (Visas, Tickets, Essentials).
- **Task Assignment & Completion:**
  - Each item has a title, category, completion checkbox (`isCompleted`), and an optional `assignedToUserId` member badge.
  - Filterable by *"All"*, *"Open"*, *"Assigned to Me"*, and *"Completed"*.

---

## 10. Portability, Offline Exports & Print Booklet
- **Full JSON Trip Backup (Export & Import):**
  - Download the entire trip (metadata, POIs, comments, votes, checklists) as a single `.json` file.
  - Import any backup `.json` file from the Dashboard to restore a trip or migrate seamlessly between a Raspberry Pi and a Vercel/Turso cloud instance.
- **GPX Export (`.gpx`):**
  - Generates a standard GPX 1.1 file containing all POIs as `<wpt>` waypoints and each planned day's sequence as a `<trk>` track—ready for offline apps like Organic Maps, OsmAnd, Komoot, or Garmin devices.
- **GeoJSON Export (`.geojson`):**
  - Exports all POIs with full metadata properties and route LineStrings for Google My Maps or uMap.
- **iCal Calendar Export (`.ics`):**
  - Exports a standard `.ics` calendar file for trips that have a `startDate`. Each scheduled POI is exported as a calendar event on its corresponding date (with coordinates, address, notes, and booking reference in the event description) for 1-click import into Apple Calendar, Google Calendar, or Outlook.
- **Printable Offline Travel Booklet (`/trips/[tripId]/print` or `@media print`):**
  - Clean, ink-friendly printable view summarizing the trip day-by-day with addresses, coordinates, time slots, booking references, cost overview, and open checklist items so travelers can save a clean PDF to their phone or print it on paper.

---

## 11. Web-First UX & Responsive Ergonomics
- **Desktop Split-Screen Layout:**
  - Left sidebar (440px width, collapsible) + full-viewport interactive map on the right.
- **Mobile & Tablet Adaptation:**
  - Floating bottom toggle button (`Map View` vs. `List / Itinerary View`) so the app remains 100% usable on smartphones while traveling.
- **Keyboard Shortcuts:**
  - Press `/` or `Cmd/Ctrl + K` to focus the smart search bar immediately.
  - Press `Esc` to close active modals or exit map Click-to-Pin mode.