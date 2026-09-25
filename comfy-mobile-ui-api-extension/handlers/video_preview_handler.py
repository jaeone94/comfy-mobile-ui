"""On-demand video thumbnails and cached browser-compatible previews."""
import asyncio
import hashlib
import json
import re
import shutil
import time
import uuid
from pathlib import Path

from aiohttp import web
import folder_paths
from .media_download_handler import resolve_download_path

VIDEO_EXTENSIONS = {'.mp4', '.mov', '.mkv', '.webm', '.avi', '.flv', '.wmv', '.m4v'}
WORKERS = asyncio.Semaphore(1)
THUMBNAIL_WORKERS = asyncio.Semaphore(1)
JOBS = {}
CACHE_TTL = 24 * 60 * 60
CACHE_LIMIT = 2 * 1024 ** 3


def cache_directory():
    directory = Path(folder_paths.get_temp_directory()).resolve() / '.mobile_video_previews'
    directory.mkdir(exist_ok=True)
    return directory


def source_video(data):
    if not isinstance(data, dict) or any(not isinstance(data.get(k, default), str) for k, default in [('type', 'output'), ('subfolder', ''), ('filename', '')]):
        raise web.HTTPBadRequest(text='Invalid video location')
    path = resolve_download_path(data.get('type', 'output'), data.get('subfolder', ''), data.get('filename', ''))
    if path.suffix.lower() not in VIDEO_EXTENSIONS:
        raise web.HTTPBadRequest(text='Unsupported video file')
    return path


def source_key(path):
    stat = path.stat()
    return hashlib.sha256(f'preview-v1:{path}:{stat.st_size}:{stat.st_mtime_ns}'.encode()).hexdigest()


def cleanup_cache():
    now = time.time()
    active = {key for key, job in JOBS.items() if job['status'] in ('queued', 'converting')}
    entries = sorted(cache_directory().glob('*.mp4'), key=lambda p: p.stat().st_mtime)
    total = sum(p.stat().st_size for p in entries)
    for path in entries:
        key = path.name.split('.')[0]
        if key in active:
            continue
        stat = path.stat()
        if now - stat.st_mtime > CACHE_TTL or total > CACHE_LIMIT:
            try:
                path.unlink()
                total -= stat.st_size
            except OSError:
                pass
    for key, job in list(JOBS.items()):
        if key not in active and (now - job['created'] > CACHE_TTL or len(JOBS) > 256):
            JOBS.pop(key, None)


async def run_command(args, timeout):
    process = await asyncio.create_subprocess_exec(*args, stdin=asyncio.subprocess.DEVNULL,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout)
        if process.returncode:
            raise RuntimeError('Video processing failed. The file may be damaged or use an unsupported codec.')
        return stdout
    finally:
        if process.returncode is None:
            process.kill()
            await process.communicate()


def thumbnail_for(path):
    stem = path.stem.removesuffix('-audio')
    for sibling in path.parent.iterdir():
        if sibling.stem == stem and sibling.suffix.lower() in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp') and sibling.is_file():
            # Do not follow a matching image outside the video's directory.
            if sibling.resolve().parent == path.parent:
                return sibling
    return None


async def generate_video_thumbnail(request):
    temporary = None
    try:
        data = await request.json()
        path = source_video(data)
        async with THUMBNAIL_WORKERS:
            target = thumbnail_for(path)
            if target is None:
                if not shutil.which('ffmpeg'):
                    return web.json_response({'error': 'FFmpeg is required to generate thumbnails.'}, status=503)
                target = path.with_name(path.stem.removesuffix('-audio') + '.png')
                temporary = cache_directory() / (uuid.uuid4().hex + '.png')
                # No seek: decode the very first video frame, including short clips.
                await run_command(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(path), '-map', '0:v:0',
                    '-frames:v', '1', '-vf', 'scale=640:640:force_original_aspect_ratio=decrease', '-threads', '1', str(temporary)], 120)
                image_bytes = temporary.read_bytes()
                if not image_bytes:
                    raise RuntimeError('The video did not produce a thumbnail.')
                # Exclusive creation also protects existing files and symlinks in a race.
                try:
                    with target.open('xb') as output:
                        output.write(image_bytes)
                except FileExistsError:
                    raise web.HTTPConflict(text='A thumbnail already exists. Refresh the gallery.')
            stat = target.stat()
            return web.json_response({'success': True, 'thumbnail': {
                'filename': target.name, 'subfolder': data.get('subfolder', ''),
                'type': data.get('type', 'output'), 'size': stat.st_size, 'modified': stat.st_mtime,
            }})
    except web.HTTPException:
        raise
    except (ValueError, TypeError):
        return web.json_response({'error': 'Invalid request.'}, status=400)
    except asyncio.TimeoutError:
        return web.json_response({'error': 'Thumbnail generation timed out.'}, status=504)
    except Exception as error:
        return web.json_response({'error': str(error)}, status=500)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)


def conversion_args(streams):
    video = next((s for s in streams if s.get('codec_type') == 'video' and not s.get('disposition', {}).get('attached_pic')), None)
    if not video:
        raise RuntimeError('No video stream was found.')
    audio = next((s for s in streams if s.get('codec_type') == 'audio'), None)
    copy_video = (video.get('codec_name') == 'h264' and video.get('pix_fmt') == 'yuv420p'
        and video.get('profile') in ('Baseline', 'Constrained Baseline', 'Main', 'High')
        and 0 < video.get('level', 0) <= 42 and max(video.get('width', 0), video.get('height', 0)) <= 1920)
    args = ['-map', f"0:{video['index']}"]
    if copy_video:
        args += ['-c:v', 'copy']
    else:
        args += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '25', '-pix_fmt', 'yuv420p',
                 '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,fps=30', '-threads', '2']
    if audio:
        args += ['-map', f"0:{audio['index']}"]
        if audio.get('codec_name') == 'aac' and audio.get('profile') == 'LC' and audio.get('channels', 0) <= 2:
            args += ['-c:a', 'copy']
        else:
            args += ['-c:a', 'aac', '-b:a', '128k', '-ac', '2']
    return args, 'remux' if copy_video else 'transcode'


async def build_preview(key, path):
    job = JOBS[key]
    temporary = cache_directory() / (key + '.part.mp4')
    target = cache_directory() / (key + '.mp4')
    try:
        async with WORKERS:
            job['status'] = 'converting'
            info = json.loads(await run_command(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(path)], 30))
            args, job['mode'] = conversion_args(info.get('streams', []))
            await run_command(['ffmpeg', '-nostdin', '-y', '-v', 'error', '-i', str(path), *args,
                '-sn', '-dn', '-map_metadata', '-1', '-movflags', '+faststart', str(temporary)], 1200)
            if source_key(path) != key:
                raise RuntimeError('The original video changed. Please retry.')
            temporary.replace(target)
            job['status'] = 'ready'
    except asyncio.CancelledError:
        job.update(status='error', error='Preview conversion was cancelled.')
        raise
    except Exception as error:
        job.update(status='error', error='Preview conversion timed out.' if isinstance(error, asyncio.TimeoutError) else str(error))
    finally:
        temporary.unlink(missing_ok=True)


def job_response(key):
    job = JOBS[key]
    return web.json_response({'id': key, 'status': job['status'], 'mode': job.get('mode'), 'error': job.get('error')})


async def start_video_preview(request):
    try:
        path = source_video(await request.json())
        cleanup_cache()
        key = source_key(path)
        target = cache_directory() / (key + '.mp4')
        if target.is_file():
            target.touch()
            JOBS[key] = {'status': 'ready', 'created': time.time()}
        elif key not in JOBS or JOBS[key]['status'] not in ('queued', 'converting'):
            if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
                return web.json_response({'error': 'FFmpeg and FFprobe are required for compatible previews.'}, status=503)
            if sum(j['status'] in ('queued', 'converting') for j in JOBS.values()) >= 8:
                return web.json_response({'error': 'Preview queue is full. Please retry shortly.'}, status=429)
            JOBS[key] = {'status': 'queued', 'created': time.time()}
            JOBS[key]['task'] = asyncio.create_task(build_preview(key, path))
        return job_response(key)
    except web.HTTPException:
        raise
    except (ValueError, TypeError):
        return web.json_response({'error': 'Invalid request.'}, status=400)


async def video_preview_status(request):
    key = request.match_info['key']
    if key not in JOBS:
        raise web.HTTPNotFound(text='Preview job not found. Please retry.')
    return job_response(key)


async def serve_video_preview(request):
    key = request.match_info['key']
    if not re.fullmatch('[a-f0-9]{64}', key):
        raise web.HTTPBadRequest()
    target = cache_directory() / (key + '.mp4')
    if not target.is_file():
        raise web.HTTPNotFound(text='Preview expired. Please generate it again.')
    target.touch()
    return web.FileResponse(target, headers={'Content-Type': 'video/mp4', 'Cache-Control': 'private, max-age=3600'})
