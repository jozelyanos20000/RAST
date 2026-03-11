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
├── app.py              # Flask API — all backend routes
├── database.py         # SQLite connection and query functions
├── requirements.txt    # Python dependencies
├── rast.db             # SQLite database
├── references/         # UI reference screenshots
├── static/
│   ├── uploads/        # Stored audio files on disk
│   └── artwork/        # Stored artwork images on disk
└── frontend/           # React + Vite app
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
There is no React Router. Screen routing is done with `activeTab` state in
`App.jsx` — values: `'discover'`, `'upload'`, `'library'`, `'profile'`. The
nav bar calls `setActiveTab`; each screen renders conditionally.

### Swipe animation flow
1. User presses Skip or Like → `exitDir` set to `'left'`/`'right'`
2. `SwipeCard` runs CSS exit animation, fires `onExited` when done
3. `pendingActionRef.current()` calls `skipTrack`/`likeTrack` from `useTrackQueue`
4. `exitDir` resets to null; hook fetches next track; `key={track.id}` re-mounts card

`useTrackQueue` maintains a `seenIds` array passed as `?seen=` to prevent
repeat tracks. Swipe right calls `POST /api/likes` to persist the like.

## Known Issues / Tech Debt
- `GET /` and `POST /upload` in `app.py` still use `render_template`,
  `flash`, and `redirect` — legacy Jinja behavior that must be
  refactored to return JSON responses.

## Flask API Endpoints

### Auth (public)
- `POST /api/auth/register` — `{username, email, password}` → `{access_token}`
- `POST /api/auth/login` — `{email or username, password}` → `{access_token}`
- `POST /api/auth/refresh` — uses httpOnly refresh token cookie → `{access_token}`
- `POST /api/auth/logout` — clears refresh token cookie

### Protected (require Bearer token)
- `GET /api/me` — returns `{username, email}` for the authenticated user
- `POST /api/upload` — accepts audio file + metadata, returns `{"success": true, "id": <int>}`
- `GET /api/random-track?seen=1,2,3` — returns random track JSON excluding current user's uploads
- `GET /api/likes` — returns all tracks liked by the current user with full metadata
- `POST /api/likes` — `{track_id}` → `{"success": true}` — records a like
- `DELETE /api/likes/<track_id>` — removes a like (future use)
- `GET /api/my-uploads` — returns all tracks uploaded by the current user, each with a `like_count` field

### Legacy (to be deprecated)
- `GET /` — legacy Jinja route
- `POST /upload` — legacy Jinja form-upload route

### `/api/upload` form fields
`audio` (file, required), `artwork` (file, optional — jpg/jpeg/png/webp),
`title`, `bpm`, `key`, `genre`, `tags` (comma-separated, max 3).

### `/api/random-track` response
```json
{
  "id": 1, "filename": "uuid_name.wav", "original_name": "name.wav",
  "title": "My Loop", "description": "...", "bpm": 95, "key": "E minor",
  "genre": "Hip Hop", "tags": "dark,groovy", "artwork": "uuid_art.jpg",
  "uploaded_at": "...", "uploaded_by": "username"
}
```
Audio served at `/static/uploads/<filename>`, artwork at `/static/artwork/<filename>`.

### `/api/likes` response
```json
[
  {
    "id": 1, "filename": "uuid_name.wav", "original_name": "name.wav",
    "title": "My Loop", "description": "...", "bpm": 95, "key": "E minor",
    "genre": "Hip Hop", "tags": "dark,groovy", "artwork": "uuid_art.jpg",
    "uploaded_by": "username", "liked_at": "..."
  }
]
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
`UNIQUE(user_id, track_id)` prevents a user from liking the same track twice.
Add new columns/tables via `_migrate()` in `database.py` — never drop or
recreate existing tables. The `uploads` table's `description` and `user_id`
columns were added this way and are absent from the original `CREATE TABLE`.
All DB access goes through `database.py`. Never write SQL in `app.py`.

### Seed Account
Existing tracks (uploaded before auth) are assigned to a seed account:
- Username: `rast_seed`
- Email: `seed@rast.app`
- Password: env var `RAST_SEED_PASSWORD` (default: `RastSeed#2024!` — change in production)

### Tags
- Stored as comma-separated string (e.g. `"dark,groovy,drake type"`)
- Maximum 3 tags per track
- Enforced at application level, not database level

## Auth Rules
- JWT access tokens stored in React memory only (never localStorage)
- Refresh tokens stored in httpOnly cookies (XSS safe)
- All routes except `/api/auth/*` require valid Bearer token
- Unauthenticated users see only Login/Register screens
- No social login — email and password only
- Login accepts either email or username

## Design System
- Mobile-first, responsive for desktop
- Dark aesthetic throughout
- Background: `#000000` pure black
- Card accent colors (cycle by track ID % 6):
  - Purple: `#7C3AED`
  - Teal: `#0D9488`
  - Amber: `#D97706`
  - Rose: `#E11D48`
  - Blue: `#2563EB`
  - Orange: `#EA580C`
- Typography: bold and heavy for track names
- Card corner radius: 20px
- Fallback card background: pure black with centered waveform
  graphic tinted in track accent color

## Main Card UI Spec
- Full screen card (mobile viewport)
- Background: artwork image if uploaded, else fallback waveform graphic
- Dark gradient overlay bottom-up for text readability
- Top: audio progress bar
- Bottom left: track name (large, bold), vibe tags as pills below
- Bottom right: upward arrow button (stems purchase — placeholder)
- Bottom nav bar: 5 icons (X and heart functional, 3 placeholder)

## Upload Screen Spec
- Full screen scrollable form, mobile-first
- Dark card sections matching the design system
- Two sections: Basic Info and Metadata
- Basic Info section:
  - Audio file upload at the top (MP3 and WAV only, 64MB max)
  - Artwork image upload on the left, Title text field on the right
  - Optional Description text field below
- Metadata section:
  - Key dropdown and BPM number field side by side
  - Genre selector below
  - Tags field: type and press enter to add, max 3 tags,
    displayed as removable pills
- Submit button at the bottom
- On successful submit: return to Discover screen
- On error: display inline error message, do not navigate away
- Connected to `POST /api/upload` endpoint

## Auth Screen Spec
- Login and Register screens replace the app entirely when logged out
- Mobile-first, full screen, dark aesthetic matching design system
- Login: email or username + password fields, submit button, link to Register
- Register: username + email + password fields, submit button, link to Login
- On successful login/register: land on Discover screen
- On error: inline error message below the relevant field
- No social login buttons

## Library Screen Spec
- Two tabs at top center: 'Liked' and 'Uploaded'
- Active tab: white text with white underline indicator
- Inactive tab: muted gray text
- Search icon top right — tapping opens inline text input, filters by title client-side
- Default active tab: Liked

### Liked Tab
- Fetches from `GET /api/likes`
- Each row contains:
  - Small square artwork thumbnail (fallback: accent color square)
  - Track title in white, tags below in muted small text
  - Audio progress bar in center, clickable to play/pause
  - Key and BPM columns on the right in muted text
  - Download button (arrow-down icon) far right — triggers direct download of audio file
- Ordered by `liked_at` descending

### Uploaded Tab
- Fetches from `GET /api/my-uploads`
- Each row identical to Liked tab except:
  - Heart icon + like count replaces the download button
  - Shows `0` if no likes yet
- Ordered by `uploaded_at` descending
```
## Profile Screen Spec
- Circle avatar placeholder showing user's first initial
- Username (display only)
- Email (display only)
- Sign Out button — calls `POST /api/auth/logout`, clears auth state, redirects to Login

## Bottom Nav Icons (left to right)
1. Discover (current view)
2. Upload
3. Library
4. Chat
5. Profile

## Out of Scope (do not build yet)
- Credit system
- Drag gesture swiping
- Stem purchasing
- Chat functionality
- Filters

## Rules
- Never break existing upload or database functionality
- Never simplify architecture for beginner-friendliness
- Always mobile-first, then scale up for desktop
- Flask serves JSON only — never HTML
- All new UI goes in React, never in Flask templates
- Commit to the design system above, do not invent new colors
- Tags field stores max 3 comma-separated vibe tags
- All DB access goes through database.py, never raw SQL in app.py
- Artwork files saved to static/artwork/, audio files to static/uploads/
- JWT access tokens in React memory only, never localStorage
- Refresh tokens in httpOnly cookies only
- likes table has UNIQUE(user_id, track_id) — never duplicate likes