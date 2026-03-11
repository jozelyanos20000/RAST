import os
import sqlite3
from werkzeug.security import generate_password_hash

DB_PATH = "rast.db"

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


# ── User functions ─────────────────────────────────────────────────────────

def create_user(username, email, password_hash):
    """Insert a new user. Raises ValueError on duplicate username or email."""
    with get_connection() as conn:
        try:
            conn.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
                (username, email, password_hash),
            )
            conn.commit()
            return conn.execute("SELECT last_insert_rowid()").fetchone()[0]
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
        conn.commit()
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_all_uploads():
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM uploads ORDER BY uploaded_at DESC"
        ).fetchall()


def add_like(user_id, track_id):
    with get_connection() as conn:
        try:
            conn.execute(
                "INSERT INTO likes (user_id, track_id) VALUES (?, ?)",
                (user_id, track_id),
            )
            conn.commit()
        except sqlite3.IntegrityError:
            pass  # already liked — idempotent


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


def get_random_track(exclude_ids=None, exclude_user_id=None):
    base = """
        SELECT u.*, us.username AS uploaded_by
        FROM uploads u
        LEFT JOIN users us ON u.user_id = us.id
    """
    with get_connection() as conn:
        if exclude_ids:
            placeholders = ",".join("?" * len(exclude_ids))
            row = conn.execute(
                f"{base} WHERE u.id NOT IN ({placeholders}) AND u.user_id != ? ORDER BY RANDOM() LIMIT 1",
                [*exclude_ids, exclude_user_id],
            ).fetchone()
        else:
            row = conn.execute(
                f"{base} WHERE u.user_id != ? ORDER BY RANDOM() LIMIT 1",
                (exclude_user_id,),
            ).fetchone()
    return row
