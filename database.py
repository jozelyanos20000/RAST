import os
import psycopg2
import psycopg2.extras
from werkzeug.security import generate_password_hash

DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://localhost/rast")
DB_PATH = DATABASE_URL  # backward compat: app.py imports this name

IntegrityError = psycopg2.IntegrityError

SEED_USERNAME = "rast_seed"
SEED_EMAIL = "seed@rast.app"
SEED_PASSWORD = os.environ.get("RAST_SEED_PASSWORD")


class _PgConnection:
    """Thin wrapper giving psycopg2 a conn.execute() convenience method."""

    def __init__(self, dsn):
        self._conn = psycopg2.connect(dsn)

    def execute(self, sql, params=None):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute(sql, params)
        return cur

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        try:
            if exc_type is None:
                self._conn.commit()
            else:
                self._conn.rollback()
        finally:
            self._conn.close()
        return False


def get_connection():
    return _PgConnection(DATABASE_URL)


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id            SERIAL PRIMARY KEY,
                username      TEXT NOT NULL UNIQUE,
                email         TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                created_at    TIMESTAMP DEFAULT NOW()
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS uploads (
                id            SERIAL PRIMARY KEY,
                filename      TEXT NOT NULL,
                original_name TEXT NOT NULL,
                uploaded_at   TIMESTAMP DEFAULT NOW(),
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
    rows = conn.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s",
        ('uploads',)
    ).fetchall()
    existing = {row["column_name"] for row in rows}
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
    rows = conn.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s",
        ('users',)
    ).fetchall()
    user_cols = {row["column_name"] for row in rows}
    if "credits" not in user_cols:
        conn.execute("ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0")

    # ── likes table ────────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS likes (
            id       SERIAL PRIMARY KEY,
            user_id  INTEGER REFERENCES users(id),
            track_id INTEGER REFERENCES uploads(id),
            liked_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, track_id)
        )
    """)

    # ── credit_transactions table ─────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS credit_transactions (
            id         SERIAL PRIMARY KEY,
            user_id    INTEGER REFERENCES users(id),
            amount     INTEGER NOT NULL,
            reason     TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )
    """)

    # ── skips table ─────────────────────────────────────────────────────────
    conn.execute("""
        CREATE TABLE IF NOT EXISTS skips (
            user_id    INTEGER REFERENCES users(id),
            track_id   INTEGER REFERENCES uploads(id),
            skipped_at TIMESTAMP DEFAULT NOW(),
            PRIMARY KEY (user_id, track_id)
        )
    """)

    # ── Seed account ───────────────────────────────────────────────────────
    seed = conn.execute(
        "SELECT id FROM users WHERE email = %s", (SEED_EMAIL,)
    ).fetchone()
    if seed is None:
        cur = conn.execute(
            "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s) RETURNING id",
            (SEED_USERNAME, SEED_EMAIL, generate_password_hash(SEED_PASSWORD)),
        )
        seed_id = cur.fetchone()["id"]
    else:
        seed_id = seed["id"]

    # Assign any orphaned uploads (uploaded before auth existed) to seed account
    conn.execute(
        "UPDATE uploads SET user_id = %s WHERE user_id IS NULL", (seed_id,)
    )


# ── Credit functions ───────────────────────────────────────────────────────

def add_credit_transaction(conn, user_id, amount, reason):
    """Atomically update users.credits and insert into credit_transactions.

    Must be called within an existing connection context (caller manages
    the transaction). Clamps credits to never go below 0.
    """
    current = conn.execute(
        "SELECT credits FROM users WHERE id = %s", (user_id,)
    ).fetchone()
    if current is None:
        raise ValueError(f"User {user_id} not found")
    new_credits = max(0, current["credits"] + amount)
    conn.execute(
        "UPDATE users SET credits = %s WHERE id = %s", (new_credits, user_id)
    )
    conn.execute(
        "INSERT INTO credit_transactions (user_id, amount, reason) VALUES (%s, %s, %s)",
        (user_id, amount, reason),
    )


def get_user_credits(user_id):
    with get_connection() as conn:
        row = conn.execute(
            "SELECT credits FROM users WHERE id = %s", (user_id,)
        ).fetchone()
        return row["credits"] if row else 0


# ── User functions ─────────────────────────────────────────────────────────

def create_user(username, email, password_hash):
    """Insert a new user with signup credits. Raises ValueError on duplicate username or email."""
    with get_connection() as conn:
        try:
            cur = conn.execute(
                "INSERT INTO users (username, email, password_hash) VALUES (%s, %s, %s) RETURNING id",
                (username, email, password_hash),
            )
            user_id = cur.fetchone()["id"]
            add_credit_transaction(conn, user_id, 5, "signup")
            conn.commit()
            return user_id
        except IntegrityError as exc:
            raise ValueError(str(exc)) from exc


def get_user_by_email(email):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email = %s", (email,)
        ).fetchone()


def get_user_by_email_or_username(login):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE email = %s OR username = %s", (login, login)
        ).fetchone()


def get_user_by_id(user_id):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM users WHERE id = %s", (user_id,)
        ).fetchone()


# ── Upload functions ───────────────────────────────────────────────────────

def add_upload(filename, original_name, title=None, bpm=None, key=None,
               genre=None, tags=None, artwork=None, description=None,
               user_id=None):
    with get_connection() as conn:
        cur = conn.execute(
            """
            INSERT INTO uploads
                (filename, original_name, title, bpm, key, genre, tags,
                 artwork, description, user_id)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (filename, original_name, title, bpm, key, genre, tags,
             artwork, description, user_id),
        )
        track_id = cur.fetchone()["id"]
        if user_id is not None:
            existing = conn.execute(
                "SELECT COUNT(*) AS cnt FROM uploads WHERE user_id = %s AND id != %s",
                (user_id, track_id),
            ).fetchone()
            is_first = existing["cnt"] == 0
            if is_first:
                add_credit_transaction(conn, user_id, 20, "first_upload")
            else:
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
            "SELECT 1 FROM likes WHERE user_id = %s AND track_id = %s",
            (user_id, track_id),
        ).fetchone()
        if existing:
            return False

        credits = conn.execute(
            "SELECT credits FROM users WHERE id = %s", (user_id,)
        ).fetchone()
        if credits is None or credits["credits"] < 1:
            raise ValueError("insufficient_credits")

        try:
            conn.execute(
                "INSERT INTO likes (user_id, track_id) VALUES (%s, %s)",
                (user_id, track_id),
            )
        except IntegrityError:
            conn.rollback()  # reset aborted transaction state for PostgreSQL
            return False  # race condition guard

        # Deduct 1 credit from liker
        add_credit_transaction(conn, user_id, -1, "swipe_right")

        # Award 1 credit to track owner
        track = conn.execute(
            "SELECT user_id FROM uploads WHERE id = %s", (track_id,)
        ).fetchone()
        if track and track["user_id"]:
            add_credit_transaction(conn, track["user_id"], 1, "like_received")

        conn.commit()
        return True


def get_upload_by_id(track_id):
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM uploads WHERE id = %s", (track_id,)
        ).fetchone()


def remove_like(user_id, track_id):
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM likes WHERE user_id = %s AND track_id = %s",
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
            WHERE l.user_id = %s
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
            WHERE u.user_id = %s
            GROUP BY u.id
            ORDER BY u.uploaded_at DESC
            """,
            (user_id,),
        ).fetchall()


def record_skip(user_id, track_id):
    """Record a skip or reset the cooldown if already skipped."""
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO skips (user_id, track_id) VALUES (%s, %s)
               ON CONFLICT(user_id, track_id)
               DO UPDATE SET skipped_at = NOW()""",
            (user_id, track_id),
        )
        conn.commit()


def get_random_track(exclude_ids=None, exclude_user_id=None,
                     genres=None, keywords=None, bpm_min=None, bpm_max=None):
    with get_connection() as conn:
        conditions = []
        params = []

        if exclude_user_id is not None:
            _uid = int(exclude_user_id)
            conditions.append("u.user_id != %s")
            params.append(_uid)

            # Exclude liked tracks permanently
            conditions.append(
                "u.id NOT IN (SELECT track_id FROM likes WHERE user_id = %s)"
            )
            params.append(_uid)

            # Exclude tracks skipped within the last 2 days
            conditions.append(
                "u.id NOT IN (SELECT track_id FROM skips WHERE user_id = %s AND skipped_at > NOW() - INTERVAL '2 days')"
            )
            params.append(_uid)

        if exclude_ids:
            placeholders = ",".join(["%s"] * len(exclude_ids))
            conditions.append(f"u.id NOT IN ({placeholders})")
            params.extend(exclude_ids)

        # Genre / keyword filter (OR between categories)
        content_conditions = []
        if genres:
            placeholders = ",".join(["%s"] * len(genres))
            content_conditions.append(f"u.genre IN ({placeholders})")
            params.extend(genres)
        if keywords:
            kw_parts = []
            for kw in keywords:
                kw_parts.append("u.tags ILIKE %s")
                params.append(f"%{kw}%")
            content_conditions.append(f"({' OR '.join(kw_parts)})")
        if content_conditions:
            conditions.append(f"({' OR '.join(content_conditions)})")

        # BPM range filter (AND with everything else)
        if bpm_min is not None:
            conditions.append("u.bpm IS NOT NULL AND u.bpm >= %s")
            params.append(bpm_min)
        if bpm_max is not None:
            conditions.append("u.bpm <= %s")
            params.append(bpm_max)

        where = " AND ".join(conditions) if conditions else "1=1"
        row = conn.execute(
            f"""SELECT u.*, us.username AS uploaded_by
                FROM uploads u
                LEFT JOIN users us ON u.user_id = us.id
                WHERE {where}
                ORDER BY RANDOM() LIMIT 1""",
            params,
        ).fetchone()
    return row
