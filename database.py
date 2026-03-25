import os
import sqlite3
from werkzeug.security import generate_password_hash

DB_PATH = os.environ.get("DATABASE_URL", "rast.db")

SEED_USERNAME = "rast_seed"
SEED_EMAIL = "seed@rast.app"
SEED_PASSWORD = os.environ.get("RAST_SEED_PASSWORD", "RastSeed#2024!")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT NOT NULL UNIQUE,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS uploads (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                filename      TEXT NOT NULL,
                original_name TEXT NOT NULL,
                uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                title         TEXT,
                bpm           INTEGER,
                key           TEXT,
                genre         TEXT,
                tags          TEXT,
                artwork       TEXT
            )
        """)
        _migrate(conn)
        conn.commit()


def _migrate(conn):
    # ── uploads column migrations ──────────────────────────────────────────
    existing = {row[1] for row in conn.execute("PRAGMA table_info(uploads)").fetchall()}
    pending = [
        ("title",       "TEXT"),
        ("bpm",         "INTEGER"),
        ("key",         "TEXT"),
        ("genre",       "TEXT"),
        ("tags",        "TEXT"),
        ("artwork",     "TEXT"),
        ("description", "TEXT"),
        ("user_id",     "INTEGER REFERENCES users(id)"),
    ]
    for col, col_type in pending:
        if col not in existing:
            conn.execute(f"ALTER TABLE uploads ADD COLUMN {col} {col_type}")

    # ── users column migrations ──────────────────────────────────────────
    user_cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "credits" not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0")

    # ── likes table ────────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS likes (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id  INTEGER REFERENCES users(id),
            track_id INTEGER REFERENCES uploads(id),
            liked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, track_id)
        )
    """)

    # ── credit_transactions table ─────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS credit_transactions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER REFERENCES users(id),
            amount     INTEGER NOT NULL,
            reason     TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── skips table ─────────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS skips (
            user_id    INTEGER REFERENCES users(id),
            track_id   INTEGER REFERENCES uploads(id),
            skipped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, track_id)
        )
    """)

    # ── Seed account ───────────────────────────────────────────────────────
    seed = conn.execute(
        "SELECT id FROM users WHERE email = ?", (SEED_EMAIL,)
    ).fetchone()
    if seed is None:
        conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
            (SEED_USERNAME, SEED_EMAIL, generate_password_hash(SEED_PASSWORD)),
        )
        seed_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    else:
        seed_id = seed["id"]

    # Assign any orphaned uploads (uploaded before auth existed) to seed account
    conn.execute(
        "UPDATE uploads SET user_id = ? WHERE user_id IS NULL", (seed_id,)
    )


# ── Credit functions ───────────────────────────────────────────────────────

def add_credit_transaction(conn, user_id, amount, reason):
    """Atomically update users.credits and insert into credit_transactions.

    Must be called within an existing connection context (caller manages
    the transaction). Clamps credits to never go below 0.
    """
    current = conn.execute(
        "SELECT credits FROM users WHERE id = ?", (user_id,)
    ).fetchone()
    if current is None:
        raise ValueError(f"User {user_id} not found")
    new_credits = max(0, current["credits"] + amount)
    conn.execute(
        "UPDATE users SET credits = ? WHERE id = ?", (new_credits, user_id)
    )
    conn.execute(
        "INSERT INTO credit_transactions (user_id, amount, reason) VALUES (?, ?, ?)",
        (user_id, amount, reason),
    )


def get_user_credits(user_id):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT credits FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        return row["credits"] if row else 0


# ── User functions ─────────────────────────────────────────────────────────

def create_user(username, email, password_hash):
    """Insert a new user with signup credits. Raises ValueError on duplicate username or email."""
    with get_connection() as conn:
        try:
            conn.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                (username, email, password_hash),
            )
            user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
            add_credit_transaction(conn, user_id, 10, "signup")
            conn.commit()
            return user_id
        except sqlite3.IntegrityError as exc:
            raise ValueError(str(exc)) from exc


def get_user_by_email(email):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()


def get_user_by_email_or_username(login):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email = ? OR username = ?", (login, login)
        ).fetchone()


def get_user_by_id(user_id):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()


# ── Upload functions ───────────────────────────────────────────────────────

def add_upload(filename, original_name, title=None, bpm=None, key=None,
               genre=None, tags=None, artwork=None, description=None,
               user_id=None):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO uploads
                (filename, original_name, title, bpm, key, genre, tags,
                 artwork, description, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (filename, original_name, title, bpm, key, genre, tags,
             artwork, description, user_id),
        )
        track_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if user_id is not None:
            add_credit_transaction(conn, user_id, 1, "upload")
        conn.commit()
        return track_id


def get_all_uploads():
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM uploads ORDER BY uploaded_at DESC"
        ).fetchall()


def add_like(user_id, track_id):
    """Record a like, deducting 1 credit from the liker and awarding 1 to the uploader.

    Returns:
        True  — like recorded successfully
        False — already liked (idempotent, no credits changed)

    Raises:
        ValueError("insufficient_credits") if user has 0 credits.
    """
    with get_connection() as conn:
        # Check if already liked — return success without touching credits
        existing = conn.execute(
            "SELECT 1 FROM likes WHERE user_id = ? AND track_id = ?",
            (user_id, track_id),
        ).fetchone()
        if existing:
            return False

        credits = conn.execute(
            "SELECT credits FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        if credits is None or credits["credits"] < 1:
            raise ValueError("insufficient_credits")

        try:
            conn.execute(
                "INSERT INTO likes (user_id, track_id) VALUES (?, ?)",
                (user_id, track_id),
            )
        except sqlite3.IntegrityError:
            return False  # race condition guard

        # Deduct 1 credit from liker
        add_credit_transaction(conn, user_id, -1, "swipe_right")

        # Award 1 credit to track owner
        track = conn.execute(
            "SELECT user_id FROM uploads WHERE id = ?", (track_id,)
        ).fetchone()
        if track and track["user_id"]:
            add_credit_transaction(conn, track["user_id"], 1, "like_received")

        conn.commit()
        return True


def get_upload_by_id(track_id):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM uploads WHERE id = ?", (track_id,)
        ).fetchone()


def remove_like(user_id, track_id):
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM likes WHERE user_id = ? AND track_id = ?",
            (user_id, track_id),
        )
        conn.commit()


def get_likes_by_user(user_id):
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT u.*, us.username AS uploaded_by, l.liked_at
            FROM likes l
            JOIN uploads u ON l.track_id = u.id
            LEFT JOIN users us ON u.user_id = us.id
            WHERE l.user_id = ?
            ORDER BY l.liked_at DESC
            """,
            (user_id,),
        ).fetchall()


def get_user_uploads_with_likes(user_id):
    with get_connection() as conn:
        return conn.execute(
            """
            SELECT u.*, COUNT(l.id) AS like_count
            FROM uploads u
            LEFT JOIN likes l ON l.track_id = u.id
            WHERE u.user_id = ?
            GROUP BY u.id
            ORDER BY u.uploaded_at DESC
            """,
            (user_id,),
        ).fetchall()


def record_skip(user_id, track_id):
    """Record a skip or reset the cooldown if already skipped."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO skips (user_id, track_id) VALUES (?, ?)
               ON CONFLICT(user_id, track_id)
               DO UPDATE SET skipped_at = CURRENT_TIMESTAMP""",
            (user_id, track_id),
        )
        conn.commit()


def get_random_track(exclude_ids=None, exclude_user_id=None):
    with get_connection() as conn:
        conditions = ["u.user_id != ?"]
        params = [exclude_user_id]

        if exclude_ids:
            placeholders = ",".join("?" * len(exclude_ids))
            conditions.append(f"u.id NOT IN ({placeholders})")
            params.extend(exclude_ids)

        # Exclude liked tracks permanently
        conditions.append(
            "u.id NOT IN (SELECT track_id FROM likes WHERE user_id = ?)"
        )
        params.append(exclude_user_id)

        # Exclude tracks skipped within the last 5 days
        conditions.append(
            "u.id NOT IN (SELECT track_id FROM skips WHERE user_id = ? AND skipped_at > datetime('now', '-5 days'))"
        )
        params.append(exclude_user_id)

        where = " AND ".join(conditions)
        row = conn.execute(
            f"""SELECT u.*, us.username AS uploaded_by
                FROM uploads u
                LEFT JOIN users us ON u.user_id = us.id
                WHERE {where}
                ORDER BY RANDOM() LIMIT 1""",
            params,
        ).fetchone()
    return row
