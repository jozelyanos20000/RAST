"""
File storage abstraction for RAST.

When R2 credentials are configured (R2_ENDPOINT_URL, R2_ACCESS_KEY_ID,
R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL), files are uploaded
to Cloudflare R2 and public URLs are returned.

When credentials are absent, files are saved to local disk under
static/uploads/ and static/artwork/, and local paths are returned.
"""

import os

import boto3
from botocore.config import Config

R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "").rstrip("/")

_use_r2 = all([R2_ENDPOINT_URL, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL])

# Local fallback directories — monkeypatched by tests to use tmp_path.
LOCAL_UPLOAD_DIR = os.path.join("static", "uploads")
LOCAL_ARTWORK_DIR = os.path.join("static", "artwork")

_s3 = None


def _get_s3():
    global _s3
    if _s3 is None:
        _s3 = boto3.client(
            "s3",
            endpoint_url=R2_ENDPOINT_URL,
            aws_access_key_id=R2_ACCESS_KEY_ID,
            aws_secret_access_key=R2_SECRET_ACCESS_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
    return _s3


def _local_dir(folder):
    if folder == "artwork":
        return LOCAL_ARTWORK_DIR
    return LOCAL_UPLOAD_DIR


def upload_file(file_bytes, filename, content_type, folder="uploads"):
    """Upload a file and return its public URL.

    Args:
        file_bytes: Raw bytes of the file.
        filename:   The storage filename (already includes uuid prefix).
        content_type: MIME type (e.g. 'audio/mpeg', 'image/jpeg').
        folder:     Subfolder — 'uploads' for audio, 'artwork' for images.

    Returns:
        Full public URL (R2) or local path string (local dev).
    """
    key = f"{folder}/{filename}"

    if _use_r2:
        _get_s3().put_object(
            Bucket=R2_BUCKET_NAME,
            Key=key,
            Body=file_bytes,
            ContentType=content_type,
        )
        return f"{R2_PUBLIC_URL}/{key}"

    # Local fallback
    local_dir = _local_dir(folder)
    os.makedirs(local_dir, exist_ok=True)
    with open(os.path.join(local_dir, filename), "wb") as f:
        f.write(file_bytes)
    return f"/static/{folder}/{filename}"


def delete_file(filename, folder="uploads"):
    """Delete a file from storage (for future use).

    Args:
        filename: The storage filename.
        folder:   Subfolder — 'uploads' or 'artwork'.
    """
    key = f"{folder}/{filename}"

    if _use_r2:
        _get_s3().delete_object(Bucket=R2_BUCKET_NAME, Key=key)
        return

    # Local fallback
    local_path = os.path.join(_local_dir(folder), filename)
    if os.path.exists(local_path):
        os.remove(local_path)
