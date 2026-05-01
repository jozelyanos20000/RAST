# RAST

RAST is a Tinder-style loop discovery platform for music producers. Instead of browsing endless catalogs, producers swipe through audio loops one at a time — pressing **Like** to save a loop to their library or **Skip** to pass. The platform solves the discovery problem in sample culture: producers upload their own loops to earn credits, then spend those credits to like loops from others, creating a reciprocal economy where contributing to the platform unlocks access to it. Liked tracks surface in a personal library for later use, and skipped tracks resurface after a 2-day cooldown so nothing is permanently buried.

---

## Features

- **Swipe-based discover feed** — CSS-animated card transitions on Like/Skip, driven by `exitDir` state in `App.jsx`
- **Guest browsing** — unauthenticated users can browse and skip freely; a bottom sheet prompts sign-up only when attempting to like
- **Pending like preservation** — if a guest likes a track and then signs up, the like is applied to the same track post-auth without losing context
- **JWT authentication** — 15-minute access tokens held in React state, 30-day refresh tokens in `httpOnly` cookies; auto-refreshes every 14 minutes; login accepts email or username
- **Loop upload** — MP3/WAV up to 64 MB, optional artwork (JPG/PNG/WebP), with full metadata: title, description, BPM, musical key, genre, and up to 3 tags
- **Credit economy** — earning credits by uploading; spending them to like; receiving them when your tracks are liked
- **Discovery filters** — filter the feed by genre, keyword/tag, and BPM range; active filter state indicated with a badge
- **Skip cooldown** — skipped tracks are excluded from the feed for 2 days, then automatically re-enter rotation
- **Permanent like exclusion** — liked tracks never reappear in the discover feed
- **Feed exhaustion** — graceful "you've heard everything" state with a refresh option
- **Library** — paginated list of all liked tracks with uploader attribution
- **Profile** — user's own uploads with per-track like counts
- **Cloudflare R2 storage** — audio and artwork stored in R2; falls back to local disk when R2 credentials are absent
- **Welcome banner** — first-time users see an onboarding prompt explaining the credit system, shown exactly once per account

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3, Flask, Gunicorn |
| Database | PostgreSQL (psycopg2, raw SQL — no ORM) |
| Frontend | React 19, Vite 7, Tailwind CSS v4 |
| Auth | flask-jwt-extended (access token in memory, refresh in httpOnly cookie) |
| File storage | Cloudflare R2 via boto3 (S3-compatible); local disk fallback |
| Testing | pytest, SQLite adapter (no live Postgres required) |
| Deployment | Render (backend + frontend), Supabase (PostgreSQL), Cloudflare R2 |

---

## Database Schema

> `database.py` is excluded from this repository. The full schema is documented here.

All tables are created via `init_db()` on startup. New columns are added through `_migrate()` — existing tables are never dropped or recreated.

### `users`

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `username` | `TEXT NOT NULL UNIQUE` | Min 3 characters |
| `email` | `TEXT NOT NULL UNIQUE` | Stored lowercase |
| `password_hash` | `TEXT NOT NULL` | Werkzeug `pbkdf2:sha256` |
| `credits` | `INTEGER NOT NULL DEFAULT 0` | Never goes below 0; clamped in `add_credit_transaction` |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |

### `uploads`

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `filename` | `TEXT NOT NULL` | R2 public URL or local `/static/uploads/` path |
| `original_name` | `TEXT NOT NULL` | Original filename as uploaded |
| `user_id` | `INTEGER REFERENCES users(id)` | Nullable; orphaned rows assigned to seed account |
| `title` | `TEXT` | |
| `description` | `TEXT` | |
| `bpm` | `INTEGER` | |
| `key` | `TEXT` | e.g. `Am`, `F#` |
| `genre` | `TEXT` | |
| `tags` | `TEXT` | Comma-separated, max 3 |
| `artwork` | `TEXT` | R2 public URL or local path |
| `uploaded_at` | `TIMESTAMP DEFAULT NOW()` | |

### `likes`

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `user_id` | `INTEGER REFERENCES users(id)` | The user who liked |
| `track_id` | `INTEGER REFERENCES uploads(id)` | |
| `liked_at` | `TIMESTAMP DEFAULT NOW()` | |

Constraint: `UNIQUE(user_id, track_id)` — re-liking is idempotent (no credit deduction on duplicate).

### `skips`

| Column | Type | Notes |
|---|---|---|
| `user_id` | `INTEGER REFERENCES users(id)` | |
| `track_id` | `INTEGER REFERENCES uploads(id)` | |
| `skipped_at` | `TIMESTAMP DEFAULT NOW()` | Reset on re-skip via `ON CONFLICT DO UPDATE` |

Constraint: `PRIMARY KEY (user_id, track_id)` — re-skipping resets `skipped_at` to now, restarting the 2-day cooldown.

### `credit_transactions`

| Column | Type | Notes |
|---|---|---|
| `id` | `SERIAL PRIMARY KEY` | |
| `user_id` | `INTEGER REFERENCES users(id)` | |
| `amount` | `INTEGER NOT NULL` | Positive = earned, negative = spent |
| `reason` | `TEXT NOT NULL` | See values below |
| `created_at` | `TIMESTAMP DEFAULT NOW()` | |

---

## Credit System

| Event | Amount | Reason value |
|---|---|---|
| Account registration | +5 | `signup` |
| First loop upload | +20 | `first_upload` |
| Subsequent uploads | +1 | `upload` |
| Your loop receives a like | +1 | `like_received` |
| You like a loop (swipe right) | −1 | `swipe_right` |
| You skip a loop (swipe left) | 0 | — |

- Credits are clamped to a minimum of 0; `add_credit_transaction` never produces a negative balance
- `POST /api/likes` returns `402` with `{"error": "insufficient_credits"}` if the user has 0 credits
- All credit changes are atomic: `users.credits` is updated and a `credit_transactions` row is inserted in the same transaction

---

## API Endpoints

### Public

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register; returns access token + sets refresh cookie |
| `POST` | `/api/auth/login` | Login by email or username |
| `POST` | `/api/auth/refresh` | Exchange refresh cookie for new access token |
| `POST` | `/api/auth/logout` | Clear refresh cookie |
| `GET` | `/api/random-track` | Fetch next track; guest-accessible (no exclusions applied) |

#### `/api/random-track` query parameters

| Param | Type | Description |
|---|---|---|
| `seen` | comma-separated IDs | Exclude already-seen tracks in the current session |
| `genres` | comma-separated strings | Filter to specific genres (OR logic) |
| `keywords` | comma-separated strings | `ILIKE` match against `tags` column (OR logic) |
| `bpm_min` | integer | Lower BPM bound (inclusive) |
| `bpm_max` | integer | Upper BPM bound (inclusive) |

When authenticated, the endpoint also automatically excludes the user's own uploads, permanently liked tracks, and tracks skipped within the last 2 days.

### Protected (Bearer token required)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/me` | Current user: username, email, credits |
| `GET` | `/api/credits` | Credit balance |
| `POST` | `/api/upload` | Upload a loop (multipart: `audio`, optional `artwork`, metadata fields) |
| `GET` | `/api/likes` | Library: all liked tracks with uploader info |
| `POST` | `/api/likes` | Like a track `{"track_id": N}` |
| `DELETE` | `/api/likes/<track_id>` | Unlike a track |
| `POST` | `/api/skips` | Record a skip `{"track_id": N}` |
| `GET` | `/api/my-uploads` | User's uploads with `like_count` |

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- A running PostgreSQL instance (or set `DATABASE_URL` to a Supabase connection string)

### Setup

**1. Clone and configure environment**

```bash
git clone https://github.com/jozelyanos20000/RAST.git
cd RAST
cp .env.example .env
# Edit .env — set FLASK_SECRET_KEY, JWT_SECRET_KEY, DATABASE_URL at minimum
```

**2. Backend**

```bash
pip install -r requirements.txt
flask run
# Flask API available at http://localhost:5000
```

**3. Frontend**

```bash
cd frontend
npm install
npm run dev
# Vite dev server at http://localhost:5173
# Proxies /api and /static to http://localhost:5000 automatically
```

Run both concurrently. The Vite proxy in `frontend/vite.config.js` handles CORS and rewrites `Set-Cookie` domains for the refresh token cookie.

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `FLASK_SECRET_KEY` | Yes | Flask session secret |
| `JWT_SECRET_KEY` | Yes | JWT signing key |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `FLASK_ENV` | No | Set to `production` to serve React from `frontend/dist/` |
| `CORS_ORIGINS` | No | Comma-separated extra allowed origins |
| `RAST_SEED_PASSWORD` | No | Password for the `rast_seed` seed account |
| `R2_ENDPOINT_URL` | No | Cloudflare R2 endpoint; falls back to local disk if unset |
| `R2_ACCESS_KEY_ID` | No | R2 access key |
| `R2_SECRET_ACCESS_KEY` | No | R2 secret key |
| `R2_BUCKET_NAME` | No | R2 bucket name |
| `R2_PUBLIC_URL` | No | Public base URL for R2 objects |

When R2 variables are absent, files are saved to `static/uploads/` and `static/artwork/` locally.

---

## Testing

```bash
# Run the full suite
pytest

# Run a single test class
pytest tests/test_api.py::TestLikes

# Run a single test
pytest tests/test_api.py::TestCreditBalance::test_first_upload_adds_20
```

**81 tests across 13 classes** covering registration, login, token refresh, logout, upload, random track exclusion logic, likes (credit flow, idempotency, own-track guard), skips and cooldown behavior, the complete credit ledger, library, my-uploads, and edge cases (expired JWT, zero-credit scenarios, feed exhaustion).

Tests run against **SQLite**, not PostgreSQL. `conftest.py` provides `_SqliteAdapter`, which translates PostgreSQL dialect to SQLite at query time:

- `%s` → `?`
- `SERIAL PRIMARY KEY` → `INTEGER PRIMARY KEY AUTOINCREMENT`
- `RETURNING id` → stripped; `lastrowid` used instead
- `NOW() - INTERVAL '2 days'` → `datetime('now', '-2 days')`
- `information_schema.columns` → `PRAGMA table_info`
- `ILIKE` → `LIKE`

Each test gets a fresh SQLite database in a `pytest` `tmp_path`. Upload and artwork directories are also redirected to `tmp_path` so no files accumulate in the project.

---

## Deployment

| Service | Role |
|---|---|
| **Render** | Hosts the Flask backend (Gunicorn) and serves the React production build from `frontend/dist/` |
| **Supabase** | Managed PostgreSQL database |
| **Cloudflare R2** | Audio and artwork file storage |

In production, `FLASK_ENV=production` causes Flask to serve React's built output directly — no separate static hosting needed.

**Build command (Render):**
```bash
pip install -r requirements.txt && cd frontend && npm install && npm run build
```

**Start command:**
```bash
gunicorn app:app
```

---

## Development Notes

RAST was built with **[Claude Code](https://claude.ai/code)** as an AI pair programmer, used throughout for accelerated feature development, test authoring, and iterative debugging. The backend and test suite were written and refined with Claude Code's assistance; all product decisions, architecture choices, and final code review were done by the author.
