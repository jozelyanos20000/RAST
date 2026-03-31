"""
Comprehensive pytest suite for the RAST Flask API.

Coverage:
  - Auth: register, login, refresh, logout
  - Upload: valid/invalid files, credit award
  - Random track: exclusions (own, liked, skipped, seen param)
  - Likes: credit flow, idempotency, own-track guard, not-found guard
  - Skips: record, cooldown reset
  - Credits: balance accuracy across every operation
  - My uploads: ownership, like_count accuracy
  - Library: GET /api/likes
  - Edge cases: expired JWT, zero-credit scenarios, exhausted feed
"""

import io
from datetime import timedelta

import pytest
from werkzeug.exceptions import RequestEntityTooLarge


# ─── in-test helpers ──────────────────────────────────────────────────────────

def _make_audio(filename="track.mp3", size=256):
    return (io.BytesIO(b"\x00" * size), filename)


def _register(client, username, email, password="password123"):
    return client.post(
        "/api/auth/register",
        json={"username": username, "email": email, "password": password},
    )


def _login(client, credential, password="password123"):
    return client.post(
        "/api/auth/login",
        json={"email": credential, "password": password},
    )


def _upload(client, token, title="Test Track", filename="track.mp3"):
    return client.post(
        "/api/upload",
        headers={"Authorization": f"Bearer {token}"},
        data={"audio": _make_audio(filename), "title": title},
        content_type="multipart/form-data",
    )


def _like(client, headers, track_id):
    return client.post("/api/likes", headers=headers, json={"track_id": track_id})


def _skip(client, headers, track_id):
    return client.post("/api/skips", headers=headers, json={"track_id": track_id})


def _credits(client, token):
    return client.get(
        "/api/credits", headers={"Authorization": f"Bearer {token}"}
    ).get_json()["credits"]


def _set_credits(username, amount):
    """Directly write a credit balance into the test DB."""
    import database

    with database.get_connection() as conn:
        conn.execute(
            "UPDATE users SET credits = ? WHERE username = ?", (amount, username)
        )
        conn.commit()


# ===========================================================================
# Register
# ===========================================================================


class TestRegister:
    def test_success_returns_201_and_access_token(self, client):
        res = _register(client, "newuser", "new@example.com")
        assert res.status_code == 201
        assert "access_token" in res.get_json()

    def test_awards_5_credits_on_signup(self, client):
        res = _register(client, "newuser", "new@example.com")
        token = res.get_json()["access_token"]
        assert _credits(client, token) == 5

    def test_sets_refresh_token_cookie(self, client):
        res = _register(client, "newuser", "new@example.com")
        cookies = res.headers.getlist("Set-Cookie")
        assert any("refresh_token" in c for c in cookies)

    def test_duplicate_username_returns_409(self, client):
        _register(client, "dupeuser", "first@example.com")
        res = _register(client, "dupeuser", "second@example.com")
        assert res.status_code == 409
        assert "taken" in res.get_json()["error"].lower()

    def test_duplicate_email_returns_409(self, client):
        _register(client, "user1", "shared@example.com")
        res = client.post(
            "/api/auth/register",
            json={"username": "user2", "email": "shared@example.com", "password": "password123"},
        )
        assert res.status_code == 409
        assert "email" in res.get_json()["error"].lower()

    def test_missing_username_returns_400(self, client):
        res = client.post(
            "/api/auth/register",
            json={"email": "new@example.com", "password": "password123"},
        )
        assert res.status_code == 400

    def test_missing_email_returns_400(self, client):
        res = client.post(
            "/api/auth/register",
            json={"username": "newuser", "password": "password123"},
        )
        assert res.status_code == 400

    def test_missing_password_returns_400(self, client):
        res = client.post(
            "/api/auth/register",
            json={"username": "newuser", "email": "new@example.com"},
        )
        assert res.status_code == 400

    def test_username_too_short_returns_400(self, client):
        res = client.post(
            "/api/auth/register",
            json={"username": "ab", "email": "new@example.com", "password": "password123"},
        )
        assert res.status_code == 400

    def test_password_too_short_returns_400(self, client):
        res = client.post(
            "/api/auth/register",
            json={"username": "newuser", "email": "new@example.com", "password": "short"},
        )
        assert res.status_code == 400


# ===========================================================================
# Login
# ===========================================================================


class TestLogin:
    def test_login_with_email_returns_200_and_token(self, client, test_user):
        res = _login(client, "test@example.com")
        assert res.status_code == 200
        assert "access_token" in res.get_json()

    def test_login_with_username_returns_200_and_token(self, client, test_user):
        res = _login(client, "testuser")
        assert res.status_code == 200
        assert "access_token" in res.get_json()

    def test_wrong_password_returns_401(self, client, test_user):
        res = _login(client, "test@example.com", "wrongpassword")
        assert res.status_code == 401

    def test_nonexistent_user_returns_401(self, client):
        res = _login(client, "nobody@example.com")
        assert res.status_code == 401

    def test_missing_password_returns_400(self, client):
        res = client.post("/api/auth/login", json={"email": "test@example.com"})
        assert res.status_code == 400

    def test_missing_credential_returns_400(self, client):
        res = client.post("/api/auth/login", json={"password": "password123"})
        assert res.status_code == 400


# ===========================================================================
# Token refresh
# ===========================================================================


class TestTokenRefresh:
    def test_refresh_returns_new_access_token(self, client, test_user):
        # Register (called by test_user fixture) sets the refresh cookie
        # in the shared client's cookie jar.
        res = client.post("/api/auth/refresh")
        assert res.status_code == 200
        data = res.get_json()
        assert "access_token" in data
        # JWTs include a random jti so successive tokens always differ
        assert data["access_token"] != test_user["token"]

    def test_refresh_without_cookie_returns_401(self, client):
        # Fresh client, no cookie set
        res = client.post("/api/auth/refresh")
        assert res.status_code == 401


# ===========================================================================
# Logout
# ===========================================================================


class TestLogout:
    def test_logout_returns_success(self, client):
        res = client.post("/api/auth/logout")
        assert res.status_code == 200
        assert res.get_json()["success"] is True

    def test_logout_clears_refresh_cookie_so_refresh_fails(self, client, test_user):
        client.post("/api/auth/logout")
        res = client.post("/api/auth/refresh")
        assert res.status_code == 401


# ===========================================================================
# /api/me
# ===========================================================================


class TestMe:
    def test_returns_username_email_credits(self, client, test_user, auth_headers):
        res = client.get("/api/me", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data["username"] == "testuser"
        assert data["email"] == "test@example.com"
        assert "credits" in data

    def test_no_auth_returns_401(self, client):
        assert client.get("/api/me").status_code == 401


# ===========================================================================
# /api/credits
# ===========================================================================


class TestCreditsEndpoint:
    def test_returns_current_balance(self, client, test_user, auth_headers):
        res = client.get("/api/credits", headers=auth_headers)
        assert res.status_code == 200
        assert res.get_json()["credits"] == 5

    def test_no_auth_returns_401(self, client):
        assert client.get("/api/credits").status_code == 401


# ===========================================================================
# /api/upload
# ===========================================================================


class TestUpload:
    def test_valid_mp3_returns_200_with_id(self, client, auth_headers):
        res = client.post(
            "/api/upload",
            headers=auth_headers,
            data={"audio": _make_audio("song.mp3"), "title": "My Loop"},
            content_type="multipart/form-data",
        )
        assert res.status_code == 200
        data = res.get_json()
        assert data["success"] is True
        assert isinstance(data["id"], int)

    def test_valid_wav_returns_200(self, client, auth_headers):
        res = client.post(
            "/api/upload",
            headers=auth_headers,
            data={"audio": _make_audio("song.wav"), "title": "WAV Loop"},
            content_type="multipart/form-data",
        )
        assert res.status_code == 200

    def test_first_upload_earns_20_credits(self, client, test_user, auth_headers):
        before = _credits(client, test_user["token"])
        _upload(client, test_user["token"])
        assert _credits(client, test_user["token"]) == before + 20

    def test_subsequent_upload_earns_1_credit(self, client, test_user, auth_headers):
        _upload(client, test_user["token"], title="First")
        before = _credits(client, test_user["token"])
        _upload(client, test_user["token"], title="Second")
        assert _credits(client, test_user["token"]) == before + 1

    def test_invalid_file_type_returns_400(self, client, auth_headers):
        res = client.post(
            "/api/upload",
            headers=auth_headers,
            data={"audio": (io.BytesIO(b"data"), "song.flac"), "title": "Bad"},
            content_type="multipart/form-data",
        )
        assert res.status_code == 400

    def test_missing_audio_returns_400(self, client, auth_headers):
        res = client.post(
            "/api/upload",
            headers=auth_headers,
            data={"title": "No File"},
            content_type="multipart/form-data",
        )
        assert res.status_code == 400

    def test_no_auth_returns_401(self, client):
        res = client.post(
            "/api/upload",
            data={"audio": _make_audio(), "title": "Anon"},
            content_type="multipart/form-data",
        )
        assert res.status_code == 401

    def test_file_too_large_returns_413(self, client, app, auth_headers):
        """Oversized upload is rejected with 413 Request Entity Too Large."""
        app.config["MAX_CONTENT_LENGTH"] = 512
        large_body = b"x" * 4096
        try:
            res = client.post(
                "/api/upload",
                headers=auth_headers,
                data={"audio": (io.BytesIO(large_body), "big.mp3"), "title": "Big"},
                content_type="multipart/form-data",
            )
            assert res.status_code == 413
        except RequestEntityTooLarge:
            pass  # some Flask versions propagate as exception — both are correct

    def test_upload_with_full_metadata(self, client, auth_headers):
        res = client.post(
            "/api/upload",
            headers=auth_headers,
            data={
                "audio": _make_audio("full.mp3"),
                "title": "Full Metadata",
                "description": "A test loop",
                "bpm": "140",
                "key": "Am",
                "genre": "Trap",
                "tags": "dark,heavy,trap",
            },
            content_type="multipart/form-data",
        )
        assert res.status_code == 200


# ===========================================================================
# /api/random-track
# ===========================================================================


class TestRandomTrack:
    def test_returns_track_shape(self, client, auth_headers, test_track):
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.status_code == 200
        data = res.get_json()
        assert data.get("exhausted") is not True
        for field in ("id", "filename", "title", "uploaded_by"):
            assert field in data

    def test_exhausted_when_no_other_tracks(self, client, auth_headers):
        # No tracks from any other user → exhausted
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.status_code == 200
        assert res.get_json() == {"exhausted": True}

    def test_excludes_own_uploads(self, client, test_user, auth_headers):
        _upload(client, test_user["token"], "My Loop")
        # Only track belongs to test_user → should be excluded → exhausted
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.get_json().get("exhausted") is True

    def test_excludes_liked_tracks(self, client, auth_headers, test_track):
        _like(client, auth_headers, test_track)
        # test_track is now liked → permanently excluded
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.get_json().get("exhausted") is True

    def test_excludes_recently_skipped_tracks(self, client, auth_headers, test_track):
        _skip(client, auth_headers, test_track)
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.get_json().get("exhausted") is True

    def test_seen_param_excludes_track(self, client, auth_headers, test_track):
        res = client.get(f"/api/random-track?seen={test_track}", headers=auth_headers)
        assert res.get_json().get("exhausted") is True

    def test_no_auth_returns_401(self, client):
        assert client.get("/api/random-track").status_code == 401


# ===========================================================================
# /api/likes  (POST, GET, DELETE)
# ===========================================================================


class TestLikes:
    def test_like_returns_success(self, client, auth_headers, test_track):
        res = _like(client, auth_headers, test_track)
        assert res.status_code == 200
        assert res.get_json()["success"] is True

    def test_like_deducts_1_credit_from_liker(
        self, client, test_user, auth_headers, test_track
    ):
        before = _credits(client, test_user["token"])
        _like(client, auth_headers, test_track)
        assert _credits(client, test_user["token"]) == before - 1

    def test_like_awards_1_credit_to_track_owner(
        self, client, auth_headers, other_user, test_track
    ):
        before = _credits(client, other_user["token"])
        _like(client, auth_headers, test_track)
        assert _credits(client, other_user["token"]) == before + 1

    def test_like_with_zero_credits_returns_402(
        self, client, auth_headers, test_track
    ):
        _set_credits("testuser", 0)
        res = _like(client, auth_headers, test_track)
        assert res.status_code == 402
        assert res.get_json()["error"] == "insufficient_credits"

    def test_duplicate_like_returns_200_no_credit_deduction(
        self, client, test_user, auth_headers, test_track
    ):
        _like(client, auth_headers, test_track)
        credits_after_first = _credits(client, test_user["token"])

        res = _like(client, auth_headers, test_track)
        assert res.status_code == 200
        assert res.get_json()["success"] is True
        # Credits unchanged on duplicate
        assert _credits(client, test_user["token"]) == credits_after_first

    def test_cannot_like_own_track_returns_400(
        self, client, test_user, auth_headers
    ):
        res = _upload(client, test_user["token"], "My Own Loop")
        own_id = res.get_json()["id"]
        res = _like(client, auth_headers, own_id)
        assert res.status_code == 400
        assert "own" in res.get_json()["error"]

    def test_like_nonexistent_track_returns_404(self, client, auth_headers):
        res = _like(client, auth_headers, 99999)
        assert res.status_code == 404

    def test_missing_track_id_returns_400(self, client, auth_headers):
        res = client.post("/api/likes", headers=auth_headers, json={})
        assert res.status_code == 400

    def test_no_auth_returns_401(self, client):
        assert client.post("/api/likes", json={"track_id": 1}).status_code == 401

    def test_get_likes_returns_liked_tracks(self, client, auth_headers, test_track):
        _like(client, auth_headers, test_track)
        res = client.get("/api/likes", headers=auth_headers)
        assert res.status_code == 200
        ids = [t["id"] for t in res.get_json()]
        assert test_track in ids

    def test_get_likes_empty_before_any_likes(self, client, auth_headers):
        res = client.get("/api/likes", headers=auth_headers)
        assert res.status_code == 200
        assert res.get_json() == []

    def test_get_likes_no_auth_returns_401(self, client):
        assert client.get("/api/likes").status_code == 401

    def test_delete_like_removes_it(self, client, auth_headers, test_track):
        _like(client, auth_headers, test_track)
        res = client.delete(f"/api/likes/{test_track}", headers=auth_headers)
        assert res.status_code == 200
        ids = [t["id"] for t in client.get("/api/likes", headers=auth_headers).get_json()]
        assert test_track not in ids

    def test_delete_like_no_auth_returns_401(self, client, test_track):
        assert client.delete(f"/api/likes/{test_track}").status_code == 401


# ===========================================================================
# /api/skips
# ===========================================================================


class TestSkips:
    def test_skip_returns_success(self, client, auth_headers, test_track):
        res = _skip(client, auth_headers, test_track)
        assert res.status_code == 200
        assert res.get_json()["success"] is True

    def test_skip_excludes_track_within_2_days(
        self, client, auth_headers, test_track
    ):
        _skip(client, auth_headers, test_track)
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.get_json().get("exhausted") is True

    def test_skip_does_not_deduct_credits(
        self, client, test_user, auth_headers, test_track
    ):
        before = _credits(client, test_user["token"])
        _skip(client, auth_headers, test_track)
        assert _credits(client, test_user["token"]) == before

    def test_reskip_resets_cooldown(self, client, auth_headers, test_track):
        import database

        # First skip
        _skip(client, auth_headers, test_track)

        # Backdate skipped_at to 3 days ago so cooldown has expired
        with database.get_connection() as conn:
            conn.execute(
                "UPDATE skips SET skipped_at = datetime('now', '-3 days')"
            )
            conn.commit()

        # Track should now be visible in the feed again
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.get_json().get("exhausted") is not True

        # Re-skip resets cooldown to now → excluded again
        _skip(client, auth_headers, test_track)
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.get_json().get("exhausted") is True

    def test_missing_track_id_returns_400(self, client, auth_headers):
        res = client.post("/api/skips", headers=auth_headers, json={})
        assert res.status_code == 400

    def test_no_auth_returns_401(self, client):
        assert client.post("/api/skips", json={"track_id": 1}).status_code == 401


# ===========================================================================
# /api/my-uploads
# ===========================================================================


class TestMyUploads:
    def test_returns_own_tracks(self, client, test_user, auth_headers):
        _upload(client, test_user["token"], "Track A")
        _upload(client, test_user["token"], "Track B")
        res = client.get("/api/my-uploads", headers=auth_headers)
        assert res.status_code == 200
        titles = {u["title"] for u in res.get_json()}
        assert "Track A" in titles
        assert "Track B" in titles

    def test_like_count_is_accurate(
        self, client, test_user, auth_headers, other_user, other_headers
    ):
        res = _upload(client, test_user["token"], "Popular Loop")
        track_id = res.get_json()["id"]

        # other_user likes the track
        _like(client, other_headers, track_id)

        res = client.get("/api/my-uploads", headers=auth_headers)
        track = next(u for u in res.get_json() if u["id"] == track_id)
        assert track["like_count"] == 1

    def test_does_not_include_other_users_tracks(
        self, client, auth_headers, test_track
    ):
        # test_track was uploaded by other_user
        res = client.get("/api/my-uploads", headers=auth_headers)
        ids = {u["id"] for u in res.get_json()}
        assert test_track not in ids

    def test_empty_when_no_uploads(self, client, auth_headers):
        res = client.get("/api/my-uploads", headers=auth_headers)
        assert res.status_code == 200
        assert res.get_json() == []

    def test_no_auth_returns_401(self, client):
        assert client.get("/api/my-uploads").status_code == 401


# ===========================================================================
# Credit balance — comprehensive flow tracking
# ===========================================================================


class TestCreditBalance:
    def test_signup_starts_at_5(self, client):
        res = _register(client, "fresh", "fresh@example.com")
        token = res.get_json()["access_token"]
        assert _credits(client, token) == 5

    def test_first_upload_adds_20(self, client, test_user, auth_headers):
        _upload(client, test_user["token"])
        assert _credits(client, test_user["token"]) == 25

    def test_like_subtracts_1(self, client, test_user, auth_headers, test_track):
        _like(client, auth_headers, test_track)
        assert _credits(client, test_user["token"]) == 4

    def test_credits_at_1_like_succeeds_and_drops_to_0(
        self, client, auth_headers, test_user, test_track
    ):
        _set_credits("testuser", 1)
        res = _like(client, auth_headers, test_track)
        assert res.status_code == 200
        assert _credits(client, test_user["token"]) == 0

    def test_credits_at_0_like_blocked_balance_unchanged(
        self, client, auth_headers, test_user, test_track
    ):
        _set_credits("testuser", 0)
        res = _like(client, auth_headers, test_track)
        assert res.status_code == 402
        assert _credits(client, test_user["token"]) == 0

    def test_upload_earns_credit_even_at_zero_balance(
        self, client, test_user, auth_headers
    ):
        _set_credits("testuser", 0)
        _upload(client, test_user["token"])
        assert _credits(client, test_user["token"]) == 20

    def test_track_owner_earns_credit_when_liked(
        self, client, auth_headers, other_user, test_track
    ):
        # other_user uploaded test_track (first upload) and got 20 upload credits → 25 total
        before = _credits(client, other_user["token"])
        _like(client, auth_headers, test_track)
        assert _credits(client, other_user["token"]) == before + 1

    def test_skip_is_free_credits_unchanged(
        self, client, test_user, auth_headers, test_track
    ):
        before = _credits(client, test_user["token"])
        _skip(client, auth_headers, test_track)
        assert _credits(client, test_user["token"]) == before


# ===========================================================================
# Edge cases
# ===========================================================================


class TestEdgeCases:
    def test_expired_jwt_returns_401(self, app, client):
        with app.app_context():
            from flask_jwt_extended import create_access_token

            expired = create_access_token(
                identity="999", expires_delta=timedelta(seconds=-1)
            )
        res = client.get("/api/me", headers={"Authorization": f"Bearer {expired}"})
        assert res.status_code == 401

    def test_malformed_jwt_returns_422(self, client):
        res = client.get(
            "/api/me", headers={"Authorization": "Bearer not.a.valid.jwt"}
        )
        assert res.status_code == 422

    def test_missing_auth_header_returns_401(self, client):
        for endpoint in ("/api/me", "/api/credits", "/api/random-track",
                         "/api/likes", "/api/my-uploads"):
            assert client.get(endpoint).status_code == 401, endpoint

    def test_exhausted_feed_returns_correct_shape(self, client, auth_headers):
        res = client.get("/api/random-track", headers=auth_headers)
        assert res.status_code == 200
        assert res.get_json() == {"exhausted": True}

    def test_skipped_track_reappears_after_2_day_cooldown(
        self, client, auth_headers, test_track
    ):
        import database

        _skip(client, auth_headers, test_track)

        # Expire the cooldown
        with database.get_connection() as conn:
            conn.execute(
                "UPDATE skips SET skipped_at = datetime('now', '-3 days')"
            )
            conn.commit()

        res = client.get("/api/random-track", headers=auth_headers)
        data = res.get_json()
        assert data.get("exhausted") is not True
        assert data["id"] == test_track

    def test_liked_track_never_reappears_in_feed(
        self, client, auth_headers, test_track
    ):
        import database

        _like(client, auth_headers, test_track)

        # Even if we fake-expire a skip entry (likes are permanent)
        with database.get_connection() as conn:
            conn.execute("DELETE FROM skips")
            conn.commit()

        res = client.get("/api/random-track", headers=auth_headers)
        assert res.get_json().get("exhausted") is True

    def test_multiple_operations_credit_integrity(
        self, client, test_user, auth_headers, other_user, other_headers
    ):
        """End-to-end credit flow: signup → upload → like → be liked."""
        # test_user: 5 credits (signup)
        assert _credits(client, test_user["token"]) == 5

        # test_user uploads (first upload) → +20
        _upload(client, test_user["token"], "Loop A")
        assert _credits(client, test_user["token"]) == 25

        # other_user uploads a track for test_user to like (first upload → +20)
        res = _upload(client, other_user["token"], "Loop B")
        loop_b_id = res.get_json()["id"]

        # test_user likes other_user's track → -1
        _like(client, auth_headers, loop_b_id)
        assert _credits(client, test_user["token"]) == 24

        # other_user earned +1 (signup 5 + first_upload 20 + like_received 1 = 26)
        assert _credits(client, other_user["token"]) == 26
