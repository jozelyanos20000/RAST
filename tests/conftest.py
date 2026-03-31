"""
Shared fixtures for RAST API test suite.

Isolation strategy:
  - Each test gets a fresh SQLite database in a pytest tmp_path.
  - database.get_connection is monkeypatched to return a SQLite adapter
    that translates PostgreSQL-dialect SQL to SQLite, so tests run
    locally without needing a PostgreSQL connection.
  - Upload/artwork folders are also redirected to tmp_path so no
    files accumulate in the project's static/ directory.
"""

import io
import os
import re
import sqlite3

import pytest


# ─── SQLite adapter (translates PostgreSQL dialect for testing) ──────────────


class _ReturningResult:
    """Fake cursor for INSERT ... RETURNING id queries."""

    def __init__(self, lastrowid):
        self._id = lastrowid

    def fetchone(self):
        return {"id": self._id}


class _ColumnResult:
    """Fake cursor for intercepted information_schema queries."""

    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None


class _SqliteAdapter:
    """Wraps a sqlite3 file connection, accepting PostgreSQL-dialect SQL.

    Translates:
      %s            → ?
      SERIAL PK     → INTEGER PK AUTOINCREMENT
      NOW()-INTERVAL→ datetime('now', '-2 days')
      DEFAULT NOW() → DEFAULT CURRENT_TIMESTAMP
      NOW()         → CURRENT_TIMESTAMP
      information_schema.columns → PRAGMA table_info
      RETURNING id  → strip + lastrowid
    """

    def __init__(self, path):
        self._conn = sqlite3.connect(path)
        self._conn.row_factory = sqlite3.Row

    # ── public interface (mirrors _PgConnection) ─────────────────────────

    def execute(self, sql, params=None):
        sql = self._translate_sql(sql)

        # Intercept information_schema queries → PRAGMA table_info
        if "information_schema.columns" in sql.lower():
            table_name = params[-1] if params else ""
            rows = self._conn.execute(
                f"PRAGMA table_info([{table_name}])"
            ).fetchall()
            return _ColumnResult([{"column_name": r["name"]} for r in rows])

        # Handle RETURNING id → strip clause, use lastrowid
        m = re.search(r"\bRETURNING\s+id\b", sql, re.IGNORECASE)
        if m:
            sql = sql[: m.start()].rstrip()
            cur = self._conn.execute(sql, params or ())
            return _ReturningResult(cur.lastrowid)

        return self._conn.execute(sql, params or ())

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is None:
            self._conn.commit()
        else:
            self._conn.rollback()
        self._conn.close()
        return False

    # ── SQL translation ──────────────────────────────────────────────────

    @staticmethod
    def _translate_sql(sql):
        # Parameter placeholders
        sql = sql.replace("%s", "?")
        # DDL type
        sql = re.sub(
            r"SERIAL\s+PRIMARY\s+KEY",
            "INTEGER PRIMARY KEY AUTOINCREMENT",
            sql,
            flags=re.IGNORECASE,
        )
        # Interval expression (must precede bare NOW() replacement)
        sql = re.sub(
            r"NOW\(\)\s*-\s*INTERVAL\s+'2 days'",
            "datetime('now', '-2 days')",
            sql,
            flags=re.IGNORECASE,
        )
        # Default clause
        sql = re.sub(
            r"DEFAULT\s+NOW\(\)",
            "DEFAULT CURRENT_TIMESTAMP",
            sql,
            flags=re.IGNORECASE,
        )
        # Remaining NOW() calls
        sql = re.sub(r"\bNOW\(\)", "CURRENT_TIMESTAMP", sql, flags=re.IGNORECASE)
        # Case-insensitive LIKE (PostgreSQL ILIKE → SQLite LIKE)
        sql = re.sub(r"\bILIKE\b", "LIKE", sql, flags=re.IGNORECASE)
        return sql


# ─── low-level helpers (used only by fixtures here) ──────────────────────────


def _make_audio(filename="track.mp3", size=256):
    """Return (BytesIO, filename) for multipart upload."""
    return (io.BytesIO(b"\x00" * size), filename)


def _register(client, username, email, password="password123"):
    return client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )


def _upload_track(client, token, title="Test Track", filename="track.mp3"):
    return client.post(
        "/api/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"audio": _make_audio(filename), "title": title},
        content_type="multipart/form-data",
    )


# ─── fixtures ─────────────────────────────────────────────────────────────────


@pytest.fixture
def app(monkeypatch, tmp_path):
    """
    Yield a fully isolated Flask app instance per test.

    - Fresh SQLite DB in tmp_path (via adapter).
    - Upload/artwork dirs in tmp_path.
    - TESTING=True, CSRF disabled for cookies.
    """
    import database as db_module

    db_path = str(tmp_path / "rast_test.db")
    upload_dir = str(tmp_path / "uploads")
    artwork_dir = str(tmp_path / "artwork")
    os.makedirs(upload_dir)
    os.makedirs(artwork_dir)

    # Patch BEFORE importing app — app.py calls init_db() at module level
    monkeypatch.setattr(db_module, "get_connection", lambda: _SqliteAdapter(db_path))
    monkeypatch.setattr(db_module, "IntegrityError", sqlite3.IntegrityError)

    import app as app_module
    import storage as storage_module

    monkeypatch.setattr(app_module, "UPLOAD_FOLDER", upload_dir)
    monkeypatch.setattr(app_module, "ARTWORK_FOLDER", artwork_dir)
    monkeypatch.setattr(storage_module, "LOCAL_UPLOAD_DIR", upload_dir)
    monkeypatch.setattr(storage_module, "LOCAL_ARTWORK_DIR", artwork_dir)

    app_module.app.config.update(
        {
            "TESTING": True,
            "UPLOAD_FOLDER": upload_dir,
            "JWT_COOKIE_CSRF_PROTECT": False,
            "JWT_COOKIE_SECURE": False,
            "MAX_CONTENT_LENGTH": 64 * 1024 * 1024,
        }
    )

    db_module.init_db()
    yield app_module.app


@pytest.fixture
def client(app):
    """Flask test client.  Cookie jar persists across all requests in a test."""
    with app.test_client() as c:
        yield c


@pytest.fixture
def test_user(client):
    """Primary test user (testuser / test@example.com).  10 signup credits."""
    res = _register(client, "testuser", "test@example.com")
    assert res.status_code == 201
    return {
        "token": res.get_json()["access_token"],
        "username": "testuser",
        "email": "test@example.com",
    }


@pytest.fixture
def auth_headers(test_user):
    return {"Authorization": f"Bearer {test_user['token']}"}


@pytest.fixture
def other_user(client):
    """Secondary test user (otheruser / other@example.com).  10 signup credits."""
    res = _register(client, "otheruser", "other@example.com")
    assert res.status_code == 201
    return {
        "token": res.get_json()["access_token"],
        "username": "otheruser",
        "email": "other@example.com",
    }


@pytest.fixture
def other_headers(other_user):
    return {"Authorization": f"Bearer {other_user['token']}"}


@pytest.fixture
def test_track(client, other_user):
    """
    A track uploaded by other_user.
    test_user can discover / like / skip this track.
    """
    res = _upload_track(client, other_user["token"], title="Other's Track")
    assert res.status_code == 200
    return res.get_json()["id"]
