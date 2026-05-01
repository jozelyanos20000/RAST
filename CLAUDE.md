# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Run Flask dev server (backend only, port 5000)
flask run

# Run all tests
pytest

# Run a single test file or test
pytest tests/test_api.py::test_register
```

### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Dev server with Vite proxy to Flask on :5000 (port 5173)
npm run dev

# Production build → frontend/dist/
npm run build

# Lint
npm run lint
```

### Full-stack dev
Run `flask run` and `npm run dev` concurrently. Vite proxies `/api` and `/static` to `http://localhost:5000`.

---

### CORS / Proxy
Vite proxy in `frontend/vite.config.js` forwards `/api` and `/static` to
`http://localhost:5000` and rewrites Set-Cookie domain for refresh token cookies.
Do not remove this.

### Environment Variables
See `.env.example`. Key vars: `FLASK_SECRET_KEY`, `JWT_SECRET_KEY`,
`FLASK_ENV` (`production` serves React from `frontend/dist`),
`DATABASE_URL` (PostgreSQL), `CORS_ORIGINS`, `R2_*` (Cloudflare R2; falls
back to local disk when unset).

## Tech Stack
- **Backend:** Python / Flask REST API, PostgreSQL via psycopg2 (raw SQL, no ORM)
- **Frontend:** React + Vite, Tailwind CSS v4 (`@tailwindcss/vite`)
- **Auth:** JWT via flask-jwt-extended (access tokens in memory, refresh in httpOnly cookies)
- **Storage:** Cloudflare R2 (`storage.py`) with local disk fallback
- **Audio:** HTML5 Audio API, MP3/WAV only
- **Image cropping:** react-easy-crop

## Architecture

Flask is a pure REST API. React handles all UI. No Jinja templating.

**Key files:** `app.py` (routes), `database.py` (all SQL), `storage.py` (file storage),
`frontend/src/App.jsx` (screen routing via `activeTab` state),
`frontend/src/hooks/useAuth.js` (JWT lifecycle),
`frontend/src/hooks/useTrackQueue.js` (swipe queue + seen tracking).

### Navigation
No React Router. `activeTab` in `App.jsx`: `'discover'`, `'upload'`, `'library'`, `'profile'`.

### Guest Browsing
Unauthenticated users can browse the discover feed and skip freely.
When a guest tries to like a loop, a sign up / log in sheet appears.
After auth, the pending like is processed on the same track.
Upload, Library, and Profile tabs redirect to auth when tapped by a guest.

### Swipe animation flow
1. User presses Skip/Like → `exitDir` set to `'left'`/`'right'`
2. `SwipeCard` runs CSS exit animation, fires `onExited`
3. `pendingActionRef.current()` calls `skipTrack`/`likeTrack` from `useTrackQueue`
4. `exitDir` resets; hook fetches next track; `key={track.id}` re-mounts card

`useTrackQueue` passes `?seen=` IDs to prevent repeats.

### Auth flow
Access tokens expire in 15 min; `useAuth` refreshes every 14 min via
`POST /api/auth/refresh` using the httpOnly cookie. Access tokens live in
React state only (never localStorage). Login accepts email or username.

## Testing Architecture

Tests run against SQLite, not PostgreSQL. `conftest.py` provides `_SqliteAdapter`
that translates PostgreSQL dialect (`%s`→`?`, `SERIAL PRIMARY KEY`→`INTEGER PRIMARY KEY AUTOINCREMENT`, `RETURNING id`→`lastrowid`, etc.).

**When adding new SQL to `database.py`:** use only PostgreSQL syntax the adapter
can translate, or extend `_translate_sql()`.

**Adapter limitations:**
- Only `RETURNING id` is supported — `RETURNING *` or other columns silently return nothing
- Interval translation is hardcoded for `'2 days'` only

Tests monkeypatch `storage.LOCAL_UPLOAD_DIR` / `storage.LOCAL_ARTWORK_DIR` directly.
Each test gets a fresh SQLite DB and temp dirs via `tmp_path`.

## Database

Five tables: `users`, `uploads`, `likes`, `skips`, `credit_transactions`.
See `database.py` `init_db()` for schemas. Key constraints:
- `likes` has `UNIQUE(user_id, track_id)` — re-liking is idempotent
- `skips` uses `PRIMARY KEY (user_id, track_id)` — re-skip resets `skipped_at`
- `credit_transactions.amount`: positive = earned, negative = spent
- `credit_transactions.reason` values: `'signup'`, `'upload'`, `'first_upload'`, `'like_received'`, `'swipe_right'`

Add new columns/tables via `_migrate()` — never drop or recreate existing tables.
All DB access goes through `database.py`. Never write SQL in `app.py`.

**Seed account:** `rast_seed` / `seed@rast.app` (password: env `RAST_SEED_PASSWORD`)

## API Endpoints

**Public:** `POST /api/auth/register`, `/login`, `/refresh`, `/logout`
`GET /api/random-track` — also public for guest browsing (no auth required)

**Protected (Bearer token):**
`GET /api/me`, `/api/credits`, `/api/likes`, `/api/my-uploads` |
`POST /api/upload`, `/api/likes`, `/api/skips` |
`DELETE /api/likes/<track_id>`

`/api/random-track` query params: `seen=&genres=&keywords=&bpm_min=&bpm_max=`
When authenticated: excludes own uploads, liked tracks (permanent), skipped tracks (2-day cooldown).
When guest: no exclusions applied.

**Legacy (to be deprecated):** `GET /` and `POST /upload` — still use Jinja.

## Credit System
- Registration → +5 credits (`'signup'`)
- First upload → +20 credits (`'first_upload'`)
- Subsequent uploads → +1 credit (`'upload'`)
- Receive a like → +1 credit (`'like_received'`)
- Swipe right → −1 credit (`'swipe_right'`)
- Swipe left → free
- Credits never go below 0
- `POST /api/likes` returns 402 if credits = 0
- All changes via `add_credit_transaction(user_id, amount, reason)` in `database.py`

## Design System
- Dark aesthetic, background `#000`
- Card accent colors (cycle by `track.id % 6`):
  `#7C3AED` `#0D9488` `#D97706` `#E11D48` `#2563EB` `#EA580C`
- Card corner radius: 20px
- Fallback card: black with waveform graphic tinted in accent color
- Tags: comma-separated, max 3, displayed as pills

## Bottom Nav (left to right)
1. Discover, 2. Upload, 3. Library, 4. Chat (placeholder), 5. Profile

## Out of Scope
Drag gesture swiping, stem purchasing, chat functionality

## Rules
- Never break existing functionality
- Never simplify for beginner-friendliness
- Flask serves JSON only — never HTML (except legacy routes)
- All UI in React, never in Flask templates
- Design system colors only — never invent new ones
- All DB access through `database.py` only
- JWT tokens: access in memory, refresh in httpOnly cookies
- credits never below 0
- skips cooldown is 2 days — exclude via `skipped_at > NOW() - INTERVAL '2 days'`
- Guest users can browse and skip freely but must auth to like, upload, or access library/profile