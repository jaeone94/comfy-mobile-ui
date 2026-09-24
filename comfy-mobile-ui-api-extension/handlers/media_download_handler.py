"""Original-file downloads, separate from inline previews and thumbnails."""
import re
from pathlib import Path
from urllib.parse import quote

from aiohttp import web
import folder_paths


def resolve_download_path(folder_type, subfolder, filename):
    roots = {
        "input": folder_paths.get_input_directory,
        "output": folder_paths.get_output_directory,
        "temp": folder_paths.get_temp_directory,
    }
    if folder_type not in roots or not filename:
        raise web.HTTPBadRequest(text="Invalid file location")
    # Validate both Windows and POSIX paths regardless of the host platform.
    for value in (subfolder, filename):
        normalized = value.replace("\\", "/")
        if (normalized.startswith("/") or ":" in normalized
                or ".." in normalized.split("/")
                or any(ord(char) < 32 or ord(char) == 127 for char in normalized)):
            raise web.HTTPBadRequest(text="Invalid file location")
    root = Path(roots[folder_type]()).resolve()
    try:
        candidate = (root / subfolder.replace("\\", "/") / filename.replace("\\", "/")).resolve()
        candidate.relative_to(root)
    except (ValueError, OSError, RuntimeError):
        raise web.HTTPBadRequest(text="Invalid file location")
    if not candidate.is_file():
        raise web.HTTPNotFound(text="File not found")
    return candidate


async def download_media(request):
    path = resolve_download_path(
        request.query.get("type", "output"),
        request.query.get("subfolder", ""),
        request.query.get("filename", ""),
    )
    fallback = re.sub(r'[^A-Za-z0-9._ -]', '_', path.name) or "download"
    disposition = f'attachment; filename="{fallback}"; filename*=UTF-8\'\'{quote(path.name, safe="")}'
    # FileResponse streams the original file and handles HEAD/Range requests.
    # No image conversion and no whole-file buffering, including large videos.
    return web.FileResponse(path, headers={
        "Content-Disposition": disposition,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })
