import os
import uuid
from flask import Flask, render_template, request, redirect, url_for, flash, jsonify
from werkzeug.utils import secure_filename
from database import init_db, add_upload, get_all_uploads, get_random_track

UPLOAD_FOLDER = os.path.join("static", "uploads")
ALLOWED_EXTENSIONS = {"mp3", "wav"}

app = Flask(__name__)
app.secret_key = "x7k$mQ2#pL9"
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 64 * 1024 * 1024  # 64 MB limit


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


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
    ext = safe_name.rsplit(".", 1)[1].lower()
    stored_filename = f"{uuid.uuid4().hex}_{safe_name}"

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    file.save(os.path.join(app.config["UPLOAD_FOLDER"], stored_filename))

    add_upload(stored_filename, original_name)

    flash(f'"{original_name}" uploaded successfully!')
    return redirect(url_for("index"))


ARTWORK_FOLDER = os.path.join("static", "artwork")
ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


def allowed_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS


@app.route("/api/upload", methods=["POST"])
def api_upload():
    if "audio" not in request.files or request.files["audio"].filename == "":
        return jsonify({"error": "Audio file is required."}), 400

    audio_file = request.files["audio"]
    if not allowed_file(audio_file.filename):
        return jsonify({"error": "Invalid audio format. Use MP3 or WAV."}), 400

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
    )
    return jsonify({"success": True, "id": track_id})


@app.route("/api/random-track")
def random_track():
    seen_param = request.args.get("seen", "")
    seen_ids = [int(i) for i in seen_param.split(",") if i.strip().isdigit()]
    track = get_random_track(seen_ids or None)
    if track is None:
        return jsonify({"exhausted": True})
    return jsonify({
        "id": track["id"],
        "filename": track["filename"],
        "original_name": track["original_name"],
        "title": track["title"],
        "description": track["description"],
        "bpm": track["bpm"],
        "key": track["key"],
        "genre": track["genre"],
        "tags": track["tags"],
        "artwork": track["artwork"],
        "uploaded_at": track["uploaded_at"],
    })


if __name__ == "__main__":
    init_db()
    app.run(debug=True)
