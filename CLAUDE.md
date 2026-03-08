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
        │   └── UploadScreen.jsx
        └── hooks/
            └── useTrackQueue.js
```

## Architecture
Flask is a pure REST API. React handles all UI. They communicate
via HTTP — React fetches from Flask endpoints, Flask returns JSON.
There is no Jinja templating, no server-rendered HTML.

## Known Issues / Tech Debt
- `GET /` and `POST /upload` in `app.py` still use `render_template`,
  `flash`, and `redirect` — legacy Jinja behavior that must be
  refactored to return JSON responses.
- `requirements.txt` only lists `flask`. `werkzeug` is used directly
  — add it explicitly if needed.

## Flask API Endpoints
- `GET /` — legacy Jinja route, to be deprecated
- `POST /api/upload` — accepts audio file + metadata, returns JSON
- `GET /api/random-track?seen=1,2,3` — returns a random track as
  JSON excluding the given IDs; returns `{"exhausted": true}` when
  none remain

### Track JSON shape
```json
{
  "id": 1,
  "filename": "uuid_originalname.wav",
  "original_name": "originalname.wav",
  "title": "My Loop",
  "bpm": 95,
  "key": "E minor",
  "genre": "Hip Hop",
  "tags": "dark,groovy,drake type",
  "artwork": "uuid_artwork.jpg",
  "uploaded_at": "2024-01-01 00:00:00"
}
```
Audio is served at `http://localhost:5000/static/uploads/<filename>`.
Artwork is served at `http://localhost:5000/static/artwork/<filename>`.

## Database Schema
Single table in `rast.db`:
```sql
CREATE TABLE uploads (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    filename      TEXT NOT NULL,
    original_name TEXT NOT NULL,
    title         TEXT,
    bpm           INTEGER,
    key           TEXT,
    genre         TEXT,
    tags          TEXT,
    artwork       TEXT,
    uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)
```
All DB access goes through `database.py`. Never write SQL in `app.py`.

### Tags
- Stored as a comma-separated string (e.g. `"dark,groovy,drake type"`)
- Maximum 3 tags per track
- Enforced at application level, not database level

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

## Bottom Nav Icons (left to right)
1. Discover (current view)
2. Upload
3. Library
4. Chat
5. Profile

## Out of Scope (do not build yet)
- User authentication
- Credit system
- Drag gesture swiping
- Stem purchasing
- Chat functionality
- Library functionality
- Profile functionality
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