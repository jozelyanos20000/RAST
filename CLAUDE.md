# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# RAST — Project Brief for Claude

## What This Is
RAST is a mobile-first web app for music producers.
The core experience is a Tinder-style swipe interface where
producers discover loops made by others — swipe right to use
a loop, swipe left to pass. Producers earn credits by uploading
loops and spend credits swiping right. The long term vision is
a two-sided marketplace where unknown producers can get their
sounds heard without needing an established name.

This is a serious, production-grade project. Always implement
at the highest possible level. Do not simplify for the sake of
readability. Use best practices, proper architecture, and
professional patterns throughout.

## Dev Commands

### Backend (Flask)
Run from the project root (`RAST/`):
```bash
python app.py
```
Flask runs on port 5000. `init_db()` is called automatically on startup.

### Frontend (React + Vite)
Run from `frontend/`:
```bash
npm run dev      # dev server on port 5173
npm run build    # production build
npm run lint     # ESLint
npm run preview  # preview production build
```
### Tests
Run from the project root (`RAST/`):
```bash
py -m pytest                              # all tests
py -m pytest tests/test_api.py::TestAuth  # single test class
py -m pytest -k "test_login"              # by name pattern
```
79 tests across 13 classes. All must pass before deployment.

Tests are fully isolated: each test gets a fresh SQLite DB and
upload/artwork dirs in `tmp_path` via monkeypatch (see `tests/conftest.py`).
No test touches the real `rast.db` or `static/` directory.

### Important: CORS / Proxy
Vite proxy is configured in `frontend/vite.config.js` pointing
`/api` and `/static` to `http://localhost:5000`. Do not remove this.

## Tech Stack
- Backend: Python / Flask (REST API only, does not serve HTML)
- Database: SQLite via sqlite3 (raw SQL, no ORM)
- Frontend: React + Vite (port 5173)
- Styling: Tailwind CSS v4 (installed via @tailwindcss/vite)
- Audio: HTML5 Audio API
- Auth: JWT via flask-jwt-extended (access + refresh tokens)
- Accepted audio formats: MP3, WAV only

## Project Structure
```
RAST/
├── app.py
├── database.py
├── requirements.txt
├── pytest.ini
├── rast.db
├── references/
├── static/
│   ├── uploads/
│   └── artwork/
├── tests/
│   ├── conftest.py
│   └── test_api.py
└── frontend/
    ├── vite.config.js
    ├── package.json
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── components/
        │   ├── SwipeCard.jsx
        │   ├── WaveformSvg.jsx
        │   ├── ActionBar.jsx
        │   ├── NavBar.jsx
        │   ├── UploadScreen.jsx
        │   ├── LoginScreen.jsx
        │   ├── RegisterScreen.jsx
        │   ├── LibraryScreen.jsx
        │   └── ProfileScreen.jsx
        └── hooks/
            ├── useTrackQueue.js
            └── useAuth.js
```

## Architecture
Flask is a pure REST API. React handles all UI. They communicate
via HTTP — React fetches from Flask endpoints, Flask returns JSON.
There is no Jinja templating, no server-rendered HTML.

JWT access tokens are stored in memory (React state), refresh tokens
in httpOnly cookies. All protected routes require a valid Bearer token.
Access tokens expire in 15 min; `useAuth` proactively refreshes every 14 min
via `POST /api/auth/refresh` using the httpOnly cookie.

### Navigation
No React Router. Screen routing uses `activeTab` state in `App.jsx`.
Values: `'discover'`, `'upload'`, `'library'`, `'profile'`.

### Swipe animation flow
1. User presses Skip or Like — `exitDir` set to `'left'`/`'right'`
2. `SwipeCard` runs CSS exit animation, fires `onExited` when done
3. `pendingActionRef.current()` calls `skipTrack`/`likeTrack` from `useTrackQueue`
4. `exitDir` resets to null; hook fetches next track; `key={track.id}` re-mounts card

`useTrackQueue` maintains a `seenIds` array passed as `?seen=` to prevent
repeat tracks. Swipe left calls `POST /api/skips`. Swipe right calls `POST /api/likes`.

## Known Issues / Tech Debt
- `GET /` and `POST /upload` in `app.py` still use `render_template`,
  `flash`, and `redirect` — legacy Jinja behavior to be refactored.

## Flask API Endpoints

### Auth (public)
- `POST /api/auth/register` — `{username, email, password}` → `{access_token}`
- `POST /api/auth/login` — `{email or username, password}` → `{access_token}`
- `POST /api/auth/refresh` — uses httpOnly refresh token cookie → `{access_token}`
- `POST /api/auth/logout` — clears refresh token cookie

### Protected (require Bearer token)
- `GET /api/me` — returns `{username, email, credits}` for the authenticated user
- `GET /api/credits` — returns `{credits: <int>}` for the current user
- `POST /api/upload` — accepts audio file + metadata, returns `{"success": true, "id": <int>}`
- `GET /api/random-track?seen=1,2,3` — returns random track JSON excluding current user's uploads, liked tracks (permanent), skipped tracks (5 day cooldown)
- `GET /api/likes` — returns all tracks liked by the current user with full metadata
- `POST /api/likes` — `{track_id}` → `{"success": true}` — deducts 1 credit, records like
- `DELETE /api/likes/<track_id>` — removes a like (future use)
- `GET /api/my-uploads` — returns all tracks uploaded by the current user with `like_count`
- `POST /api/skips` — `{track_id}` → `{"success": true}` — records or resets a skip

### Legacy (to be deprecated)
- `GET /` — legacy Jinja route
- `POST /upload` — legacy Jinja form-upload route

### `/api/random-track` response
```json
{
  "id": 1, "filename": "uuid_name.wav", "original_name": "name.wav",
  "title": "My Loop", "description": "...", "bpm": 95, "key": "E minor",
  "genre": "Hip Hop", "tags": "dark,groovy", "artwork": "uuid_art.jpg",
  "uploaded_at": "...", "uploaded_by": "username"
}
```

## Database Schema

### users
```sql
CREATE TABLE users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```
Note: `credits INTEGER NOT NULL DEFAULT 0` added via `_migrate()`.

### uploads
```sql
CREATE TABLE uploads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER REFERENCES users(id),
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    title         TEXT,
    description   TEXT,
    bpm           INTEGER,
    key           TEXT,
    genre         TEXT,
    tags          TEXT,
    artwork       TEXT,
    uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```

### likes
```sql
CREATE TABLE likes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id),
    track_id   INTEGER REFERENCES uploads(id),
    liked_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, track_id)
)
```

### skips
```sql
CREATE TABLE skips (
    user_id    INTEGER REFERENCES users(id),
    track_id   INTEGER REFERENCES uploads(id),
    skipped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, track_id)
)
```
Tracks skipped within the last 5 days are excluded from the feed.
Re-skipping a track resets `skipped_at` to extend the cooldown.

### credit_transactions
```sql
CREATE TABLE credit_transactions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER REFERENCES users(id),
    amount     INTEGER NOT NULL,
    reason     TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```
`amount` is positive for credits earned, negative for credits spent.
`reason` values: `'signup'`, `'upload'`, `'like_received'`, `'swipe_right'`

Add new columns/tables via `_migrate()` — never drop or recreate existing tables.
All DB access goes through `database.py`. Never write SQL in `app.py`.

### Seed Account
- Username: `rast_seed` / Email: `seed@rast.app`
- Password: env var `RAST_SEED_PASSWORD` (default: `RastSeed#2024!`)

### Tags
- Comma-separated string, max 3 tags, enforced at application level

## Auth Rules
- JWT access tokens in React memory only (never localStorage)
- Refresh tokens in httpOnly cookies (XSS safe)
- All routes except `/api/auth/*` require valid Bearer token
- Unauthenticated users see only Login/Register screens
- No social login — email and password only
- Login accepts either email or username

## Design System
- Mobile-first, responsive for desktop
- Dark aesthetic, background `#000000`
- Card accent colors (cycle by track ID % 6):
  - Purple `#7C3AED`, Teal `#0D9488`, Amber `#D97706`
  - Rose `#E11D48`, Blue `#2563EB`, Orange `#EA580C`
- Typography: bold and heavy for track names
- Card corner radius: 20px
- Fallback card: pure black with waveform graphic tinted in accent color

## Screen Specs

### Main Card (Discover)
- Full screen card, mobile viewport
- Background: artwork image or fallback waveform graphic
- Dark gradient overlay bottom-up
- Top: audio progress bar
- Top right: credit balance (small, unobtrusive)
- Bottom left: track name (large bold), vibe tags as pills below
- Bottom right: upward arrow button (stems — placeholder)
- Buttons: X (skip, free) and heart (like, costs 1 credit) overlaid on card
- Bottom nav bar: 5 icons

### Upload Screen
- Full screen scrollable form, mobile-first
- Basic Info: audio upload, artwork + title side by side, description
- Metadata: key + BPM side by side, genre, tags (max 3, pill style)
- Submit → Discover on success, inline error on failure
- Connected to `POST /api/upload`

### Auth Screens
- Login and Register replace the app when logged out
- Login: email or username + password, link to Register
- Register: username + email + password, link to Login
- Success → Discover screen

### Library Screen
- Two tabs top center: Liked (default) and Uploaded
- Search icon top right, filters by title client-side
- Liked tab: fetches `GET /api/likes`, download button per row
- Uploaded tab: fetches `GET /api/my-uploads`, heart + like count per row
- Each row: artwork thumbnail, title + tags, audio progress bar, key + BPM

### Profile Screen
- Circle avatar with user's first initial
- Username, email, credit balance (display only)
- Sign Out button

## Credit System

### Rules
- New user registration → +10 credits (`'signup'`)
- Upload a loop → +1 credit (`'upload'`)
- Receive a like → +1 credit (`'like_received'`)
- Swipe right → -1 credit (`'swipe_right'`)
- Swipe left → free
- Credits never go below 0
- No monthly reset for beta

### Backend
- All credit changes via `add_credit_transaction(user_id, amount, reason)` in `database.py`
- Updates `users.credits` and inserts into `credit_transactions` atomically
- `POST /api/likes` returns `{"error": "insufficient_credits"}` with 402 if credits = 0

### UI
- Credit balance shown top right of Discover screen and on Profile screen
- Toast notification when credits = 0: "You're out of credits, upload a loop to earn more"
- Swipe right blocked at 0 credits

## Bottom Nav Icons (left to right)
1. Discover, 2. Upload, 3. Library, 4. Chat, 5. Profile

## Out of Scope
- Drag gesture swiping
- Stem purchasing
- Chat functionality
- Filters

## Rules
- Never break existing functionality
- Never simplify for beginner-friendliness
- Flask serves JSON only — never HTML
- All UI in React, never in Flask templates
- Design system colors only — never invent new ones
- All DB access through database.py only
- JWT tokens: access in memory, refresh in httpOnly cookies
- likes UNIQUE(user_id, track_id) — no duplicate likes
- credits never below 0
- skips cooldown is 5 days — exclude via `skipped_at > datetime('now', '-5 days')`