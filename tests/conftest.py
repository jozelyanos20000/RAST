"""
Shared fixtures for RAST API test suite.

Isolation strategy:
  - Each test gets a fresh SQLite database in a pytest tmp_path.
  - database.DB_PATH is monkeypatched before init_db() is called,
    so every get_connection() in that test hits the test-only file.
  - Upload/artwork folders are also redirected to tmp_path so no
    files accumulate in the project's static/ directory.
"""

import io
import os
import pytest


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

    - Fresh SQLite DB in tmp_path.
    - Upload/artwork dirs in tmp_path.
    - TESTING=True, CSRF disabled for cookies.
    """
    import database as db_module
    import app as app_module

    db_path = str(tmp_path / "rast_test.db")
    upload_dir = str(tmp_path / "uploads")
    artwork_dir = str(tmp_path / "artwork")
    os.makedirs(upload_dir)
    os.makedirs(artwork_dir)

    monkeypatch.setattr(db_module, "DB_PATH", db_path)
    monkeypatch.setattr(app_module, "UPLOAD_FOLDER", upload_dir)
    monkeypatch.setattr(app_module, "ARTWORK_FOLDER", artwork_dir)

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
