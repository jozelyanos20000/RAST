import sqlite3

DB_PATH = "rast.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
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
        # Idempotent migrations: add columns that may not exist in older DBs
        _migrate(conn)
        conn.commit()


def _migrate(conn):
    existing = {row[1] for row in conn.execute("PRAGMA table_info(uploads)").fetchall()}
    pending = [
        ("title",   "TEXT"),
        ("bpm",     "INTEGER"),
        ("key",     "TEXT"),
        ("genre",   "TEXT"),
        ("tags",    "TEXT"),
        ("artwork", "TEXT"),
    ]
    for col, col_type in pending:
        if col not in existing:
            conn.execute(f"ALTER TABLE uploads ADD COLUMN {col} {col_type}")


def add_upload(filename, original_name, title=None, bpm=None, key=None,
               genre=None, tags=None, artwork=None):
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO uploads
                (filename, original_name, title, bpm, key, genre, tags, artwork)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (filename, original_name, title, bpm, key, genre, tags, artwork),
        )
        conn.commit()
        return conn.execute("SELECT last_insert_rowid()").fetchone()[0]


def get_all_uploads():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM uploads ORDER BY uploaded_at DESC"
        ).fetchall()
    return rows


def get_random_track(exclude_ids=None):
    with get_connection() as conn:
        if exclude_ids:
            placeholders = ','.join('?' * len(exclude_ids))
            row = conn.execute(
                f"SELECT * FROM uploads WHERE id NOT IN ({placeholders}) ORDER BY RANDOM() LIMIT 1",
                exclude_ids,
            ).fetchone()
        else:
            row = conn.execute(
                "SELECT * FROM uploads ORDER BY RANDOM() LIMIT 1"
            ).fetchone()
    return row
