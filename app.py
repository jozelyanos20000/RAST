import os
import uuid
from datetime import timedelta

from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
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
    init_db, add_upload, get_all_uploads, get_random_track,
    create_user, get_user_by_email, get_user_by_email_or_username, get_user_by_id,
    add_like, remove_like, get_likes_by_user, get_user_uploads_with_likes,
)

UPLOAD_FOLDER = os.path.join("static", "uploads")
ARTWORK_FOLDER = os.path.join("static", "artwork")
ALLOWED_EXTENSIONS = {"mp3", "wav"}
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}

app = Flask(__name__)
app.secret_key = "x7k$mQ2#pL9"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024  # 64 MB

# ── JWT configuration ──────────────────────────────────────────────────────
app.config["JWT_SECRET_KEY"] = os.environ.get(
    "JWT_SECRET_KEY", "rast-jwt-dev-secret-CHANGE-IN-PROD"
)
app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(minutes=15)
app.config["JWT_REFRESH_TOKEN_EXPIRES"] = timedelta(days=30)
app.config["JWT_TOKEN_LOCATION"] = ["headers", "cookies"]
app.config["JWT_COOKIE_SECURE"] = False          # True in production (HTTPS)
app.config["JWT_COOKIE_CSRF_PROTECT"] = False    # Add CSRF protection in production
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


# ── Legacy routes (to be deprecated) ──────────────────────────────────────

@app.route("/")
def index():
    uploads = get_all_uploads()
    return render_template("index.html", uploads=uploads)


@app.route("/upload", methods=["POST"])
def upload():
    if "audio" not in request.files:
        flash("No file selected.")
        return redirect(url_for("index"))
    file = request.files["audio"]
    if file.filename == "":
        flash("No file selected.")
        return redirect(url_for("index"))
    if not allowed_file(file.filename):
        flash("Invalid file type. Allowed types: mp3, wav.")
        return redirect(url_for("index"))
    original_name = file.filename
    safe_name = secure_filename(original_name)
    stored_filename = f"{uuid.uuid4().hex}_{safe_name}"
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    file.save(os.path.join(app.config["UPLOAD_FOLDER"], stored_filename))
    add_upload(stored_filename, original_name)
    flash(f'"{original_name}" uploaded successfully!')
    return redirect(url_for("index"))


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
    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    audio_file.save(os.path.join(app.config["UPLOAD_FOLDER"], stored_filename))

    artwork_filename = None
    artwork_file = request.files.get("artwork")
    if artwork_file and artwork_file.filename and allowed_image(artwork_file.filename):
        art_safe = secure_filename(artwork_file.filename)
        art_stored = f"{uuid.uuid4().hex}_{art_safe}"
        os.makedirs(ARTWORK_FOLDER, exist_ok=True)
        artwork_file.save(os.path.join(ARTWORK_FOLDER, art_stored))
        artwork_filename = art_stored

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
        filename=stored_filename,
        original_name=original_name,
        title=title,
        description=description,
        bpm=bpm,
        key=key,
        genre=genre,
        tags=tags,
        artwork=artwork_filename,
        user_id=user_id,
    )
    return jsonify(success=True, id=track_id)


@app.route("/api/me")
@jwt_required(locations=["headers"])
def me():
    user = get_user_by_id(int(get_jwt_identity()))
    if user is None:
        return jsonify(error="User not found"), 404
    return jsonify(username=user["username"], email=user["email"])


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
    add_like(user_id, int(track_id))
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


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
