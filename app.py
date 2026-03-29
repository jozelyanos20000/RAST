import os
import uuid
from datetime import timedelta

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    create_refresh_token,
    jwt_required,
    get_jwt_identity,
    set_refresh_cookies,
    unset_refresh_cookies,
)
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

from database import (
    init_db, DB_PATH, add_upload, get_random_track,
    create_user, get_user_by_email_or_username, get_user_by_id,
    add_like, remove_like, get_likes_by_user, get_user_uploads_with_likes,
    get_user_credits, record_skip, get_upload_by_id,
)
from storage import upload_file

UPLOAD_FOLDER = os.path.join("static", "uploads")
ARTWORK_FOLDER = os.path.join("static", "artwork")
ALLOWED_EXTENSIONS = {"mp3", "wav"}
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

_is_production = os.environ.get("FLASK_ENV") == "production"

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "dev-secret-key-CHANGE-IN-PROD")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024  # 64 MB

# ── CORS ──────────────────────────────────────────────────────────────────
_default_origins = ["http://localhost:5173", "http://localhost:5000"]
_extra_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "").split(",")
    if o.strip()
]
CORS(app, origins=_default_origins + _extra_origins, supports_credentials=True)

# ── JWT configuration ──────────────────────────────────────────────────────
app.config["JWT_SECRET_KEY"] = os.environ.get(
    "JWT_SECRET_KEY", "rast-jwt-dev-secret-CHANGE-IN-PROD"
)
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=15)
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)
app.config["JWT_TOKEN_LOCATION"] = ["headers", "cookies"]
app.config["JWT_COOKIE_SECURE"] = _is_production
app.config["JWT_COOKIE_CSRF_PROTECT"] = False
app.config["JWT_COOKIE_SAMESITE"] = "Lax"

jwt = JWTManager(app)


# ── JWT error handlers ─────────────────────────────────────────────────────

@jwt.unauthorized_loader
def unauthorized_callback(reason):
    return jsonify(error="Unauthorized", reason=reason), 401


@jwt.invalid_token_loader
def invalid_token_callback(reason):
    return jsonify(error="Invalid token", reason=reason), 422


@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_data):
    return jsonify(error="Token expired"), 401


@jwt.needs_fresh_token_loader
def needs_fresh_token_callback(jwt_header, jwt_data):
    return jsonify(error="Fresh token required"), 401


# ── Helpers ────────────────────────────────────────────────────────────────

def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def allowed_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


# ── Auth endpoints ─────────────────────────────────────────────────────────

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not username or not email or not password:
        return jsonify(error="Username, email, and password are required"), 400
    if len(username) < 3:
        return jsonify(error="Username must be at least 3 characters"), 400
    if len(password) < 8:
        return jsonify(error="Password must be at least 8 characters"), 400

    try:
        user_id = create_user(username, email, generate_password_hash(password))
    except ValueError as exc:
        msg = str(exc).lower()
        if "username" in msg:
            return jsonify(error="Username is already taken"), 409
        if "email" in msg:
            return jsonify(error="Email is already registered"), 409
        return jsonify(error="Registration failed"), 409

    access_token = create_access_token(identity=str(user_id))
    refresh_token = create_refresh_token(identity=str(user_id))
    resp = jsonify(access_token=access_token)
    set_refresh_cookies(resp, refresh_token)
    return resp, 201


@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return jsonify(error="Email and password are required"), 400

    user = get_user_by_email_or_username(email)
    if not user or not check_password_hash(user["password_hash"], password):
        return jsonify(error="Invalid email or password"), 401

    access_token = create_access_token(identity=str(user["id"]))
    refresh_token = create_refresh_token(identity=str(user["id"]))
    resp = jsonify(access_token=access_token)
    set_refresh_cookies(resp, refresh_token)
    return resp


@app.route("/api/auth/refresh", methods=["POST"])
@jwt_required(refresh=True, locations=["cookies"])
def token_refresh():
    identity = get_jwt_identity()
    access_token = create_access_token(identity=identity)
    return jsonify(access_token=access_token)


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    resp = jsonify(success=True)
    unset_refresh_cookies(resp)
    return resp


# ── Protected API ──────────────────────────────────────────────────────────

@app.route("/api/upload", methods=["POST"])
@jwt_required(locations=["headers"])
def api_upload():
    user_id = int(get_jwt_identity())

    if "audio" not in request.files or request.files["audio"].filename == "":
        return jsonify(error="Audio file is required."), 400

    audio_file = request.files["audio"]
    if not allowed_file(audio_file.filename):
        return jsonify(error="Invalid audio format. Use MP3 or WAV."), 400

    original_name = audio_file.filename
    safe_name = secure_filename(original_name)
    stored_filename = f"{uuid.uuid4().hex}_{safe_name}"
    audio_url = upload_file(
        audio_file.read(),
        stored_filename,
        audio_file.content_type or "application/octet-stream",
        folder="uploads",
    )

    artwork_url = None
    artwork_file = request.files.get("artwork")
    if artwork_file and artwork_file.filename and allowed_image(artwork_file.filename):
        art_safe = secure_filename(artwork_file.filename)
        art_stored = f"{uuid.uuid4().hex}_{art_safe}"
        artwork_url = upload_file(
            artwork_file.read(),
            art_stored,
            artwork_file.content_type or "image/jpeg",
            folder="artwork",
        )

    title = request.form.get("title", "").strip() or None
    description = request.form.get("description", "").strip() or None
    bpm_raw = request.form.get("bpm", "").strip()
    bpm = int(bpm_raw) if bpm_raw.isdigit() else None
    key = request.form.get("key", "").strip() or None
    genre = request.form.get("genre", "").strip() or None
    raw_tags = request.form.get("tags", "").strip()
    tags_list = [t.strip() for t in raw_tags.split(",") if t.strip()][:3]
    tags = ",".join(tags_list) or None

    track_id = add_upload(
        filename=audio_url,
        original_name=original_name,
        title=title,
        description=description,
        bpm=bpm,
        key=key,
        genre=genre,
        tags=tags,
        artwork=artwork_url,
        user_id=user_id,
    )
    return jsonify(success=True, id=track_id)


@app.route("/api/me")
@jwt_required(locations=["headers"])
def me():
    user = get_user_by_id(int(get_jwt_identity()))
    if user is None:
        return jsonify(error="User not found"), 404
    return jsonify(username=user["username"], email=user["email"], credits=user["credits"])


@app.route("/api/credits")
@jwt_required(locations=["headers"])
def credits():
    user_id = int(get_jwt_identity())
    return jsonify(credits=get_user_credits(user_id))


@app.route("/api/likes", methods=["GET"])
@jwt_required(locations=["headers"])
def get_likes():
    user_id = int(get_jwt_identity())
    rows = get_likes_by_user(user_id)
    return jsonify([{
        "id":            r["id"],
        "filename":      r["filename"],
        "original_name": r["original_name"],
        "title":         r["title"],
        "description":   r["description"],
        "bpm":           r["bpm"],
        "key":           r["key"],
        "genre":         r["genre"],
        "tags":          r["tags"],
        "artwork":       r["artwork"],
        "uploaded_by":   r["uploaded_by"],
        "liked_at":      r["liked_at"],
    } for r in rows])


@app.route("/api/likes", methods=["POST"])
@jwt_required(locations=["headers"])
def post_like():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    track_id = data.get("track_id")
    if not track_id:
        return jsonify(error="track_id is required"), 400
    track_id = int(track_id)
    track = get_upload_by_id(track_id)
    if track is None:
        return jsonify(error="track_not_found"), 404
    if track["user_id"] == user_id:
        return jsonify(error="cannot_like_own_track"), 400
    try:
        add_like(user_id, track_id)
    except ValueError as exc:
        if "insufficient_credits" in str(exc):
            return jsonify(error="insufficient_credits"), 402
        raise
    return jsonify(success=True)


@app.route("/api/likes/<int:track_id>", methods=["DELETE"])
@jwt_required(locations=["headers"])
def delete_like(track_id):
    user_id = int(get_jwt_identity())
    remove_like(user_id, track_id)
    return jsonify(success=True)


@app.route("/api/my-uploads")
@jwt_required(locations=["headers"])
def my_uploads():
    user_id = int(get_jwt_identity())
    rows = get_user_uploads_with_likes(user_id)
    return jsonify([{
        "id":            r["id"],
        "filename":      r["filename"],
        "original_name": r["original_name"],
        "title":         r["title"],
        "description":   r["description"],
        "bpm":           r["bpm"],
        "key":           r["key"],
        "genre":         r["genre"],
        "tags":          r["tags"],
        "artwork":       r["artwork"],
        "uploaded_at":   r["uploaded_at"],
        "like_count":    r["like_count"],
    } for r in rows])


@app.route("/api/skips", methods=["POST"])
@jwt_required(locations=["headers"])
def post_skip():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    track_id = data.get("track_id")
    if not track_id:
        return jsonify(error="track_id is required"), 400
    record_skip(user_id, int(track_id))
    return jsonify(success=True)


@app.route("/api/random-track")
@jwt_required(locations=["headers"])
def random_track():
    current_user_id = get_jwt_identity()
    seen_param = request.args.get("seen", "")
    seen_ids = [int(i) for i in seen_param.split(",") if i.strip().isdigit()]
    track = get_random_track(seen_ids or None, exclude_user_id=current_user_id)
    if track is None:
        return jsonify(exhausted=True)
    return jsonify({
        "id":            track["id"],
        "filename":      track["filename"],
        "original_name": track["original_name"],
        "title":         track["title"],
        "description":   track["description"],
        "bpm":           track["bpm"],
        "key":           track["key"],
        "genre":         track["genre"],
        "tags":          track["tags"],
        "artwork":       track["artwork"],
        "uploaded_at":   track["uploaded_at"],
        "uploaded_by":   track["uploaded_by"],
    })


# ── Serve React production build ──────────────────────────────────────────

_DIST_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", "dist")

if _is_production:
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def serve_react(path):
        full = os.path.join(_DIST_DIR, path)
        if path and os.path.isfile(full):
            return send_from_directory(_DIST_DIR, path)
        return send_from_directory(_DIST_DIR, "index.html")


init_db()
if __name__ == "__main__":
    @app.route("/api/debug")
    def debug():
        import sqlite3
        try:
            conn = sqlite3.connect(DB_PATH)
            tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
            conn.close()
            return jsonify(db_path=DB_PATH, tables=[t[0] for t in tables])
        except Exception as e:
            return jsonify(error=str(e), db_path=DB_PATH)
    app.run(debug=True)
