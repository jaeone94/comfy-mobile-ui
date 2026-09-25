import argparse
import asyncio
import json
import os
import re
import shutil
import sys
from pathlib import Path
from urllib.parse import urlparse

import folder_paths


class FormatError(ValueError):
    pass


# Server-owned file, next to api.py. Never read browser cookies or accept a path from the FE.
COOKIE_FILE = Path(__file__).resolve().parent.parent / 'cookie.txt'
COOKIE_RETRY_ERROR = 'Cookie-authenticated request failed. Check cookie.txt format, expiry and account access.'


def cookie_retry_command(command, error):
    if '--cookies' in command:
        return None
    # Prefer the actual error over incidental warnings suggesting cookies.
    errors = [line for line in error.splitlines() if re.search(r'\bERROR:', line, re.I)]
    message = '\n'.join(errors) if errors else error
    auth_error = re.search(
        r'not available for all users|login required|log[ -]?in (?:is )?required|'
        r'please (?:log[ -]?in|sign[ -]?in)|sign[ -]?in to|'
        r'(?:use|provide|pass).{0,40}--cookies|authentication required|'
        r'requires? authentication|HTTP Error 401|'
        r'cookies? (?:are |is )?(?:required|expired|invalid)|'
        r'로그인.{0,12}필요|모든 사용자에게 공개', message, re.I)
    if not auth_error or not COOKIE_FILE.is_file():
        return None
    # Insert before the end-of-options marker; never let a URL become an option.
    index = command.index('--')
    return [*command[:index], '--cookies', str(COOKIE_FILE), *command[index:]]


def validate_url(url):
    url = url.strip() if isinstance(url, str) else url
    if not isinstance(url, str) or urlparse(url).scheme not in ('http', 'https') or not urlparse(url).hostname:
        raise FormatError('Enter a valid HTTP or HTTPS video URL.')
    return url.strip()


def normalize_formats(info, ffmpeg_available):
    if info.get('_type') in ('playlist', 'multi_video') or 'entries' in info:
        raise FormatError('Please use a single video URL, not a playlist or multi-video post.')
    formats = info.get('formats') or [info]
    # yt-dlp orders formats from worst to best. Keep its current ranking.
    usable = [f for f in formats if not f.get('has_drm') and (f.get('url') or f.get('fragments'))
              and re.fullmatch(r'[\w.-]+', str(f.get('format_id', '')))
              and f.get('protocol') != 'mhtml' and f.get('ext') != 'mhtml']
    audio = [f for f in usable if f.get('vcodec') == 'none' and f.get('acodec') not in (None, 'none')]
    result = []
    for f in usable:
        if f.get('vcodec') == 'none':
            continue
        if not f.get('vcodec') and not (f.get('height') or f.get('ext') in ('mp4', 'webm', 'mkv', 'mov', 'flv', 'avi')):
            continue
        # Missing codec metadata is common for direct MP4 links; do not treat it as video-only.
        has_audio = f.get('acodec') != 'none'
        needs_merge = not has_audio and bool(audio)
        audio_id = str(audio[-1]['format_id']) if needs_merge else None
        needs_ffmpeg = needs_merge or f.get('protocol') in ('m3u8', 'rtmp', 'rtsp', 'mms')
        result.append({
            'id': str(f['format_id']), 'ext': f.get('ext', ''),
            'resolution': f.get('resolution') or (str(f['height']) + 'p' if f.get('height') else ''),
            'fps': f.get('fps'), 'vcodec': f.get('vcodec'), 'acodec': f.get('acodec'),
            'has_audio': has_audio or needs_merge, 'requires_ffmpeg': needs_ffmpeg, 'merges_audio': needs_merge,
            'available': not needs_ffmpeg or ffmpeg_available,
            'selector': str(f['format_id']) + ('+' + audio_id if audio_id else ''),
        })
    if not result:
        raise FormatError('No downloadable video formats were found for this URL.')
    return result


async def probe_video_formats(url):
    url = validate_url(url)
    command = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-playlist',
        '--dump-single-json', '--skip-download', '--no-warnings', '--encoding', 'utf-8', '--', url]
    deadline = asyncio.get_running_loop().time() + 90
    for attempt in range(2):
        process = await asyncio.create_subprocess_exec(*command,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        try:
            remaining = max(0, deadline - asyncio.get_running_loop().time())
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=remaining)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            if process.returncode is None:
                process.kill()
            await process.communicate()
            raise
        if not process.returncode:
            break
        error = stderr.decode('utf-8', errors='replace').strip() or 'Could not inspect this video.'
        retry = cookie_retry_command(command, error) if attempt == 0 else None
        if retry is None:
            # Malformed cookie files can cause yt-dlp to echo their contents. Never expose retry errors.
            raise FormatError(COOKIE_RETRY_ERROR if attempt else error)
        command = retry
    info = json.loads(stdout)
    ffmpeg = shutil.which('ffmpeg') is not None
    return {
        'title': info.get('title', ''), 'extractor': info.get('extractor_key') or info.get('extractor', ''),
        'ffmpeg_available': ffmpeg, 'formats': normalize_formats(info, ffmpeg),
    }


def choose_format(formats, format_id='auto'):
    if not isinstance(format_id, str):
        raise FormatError('Invalid format ID.')
    candidates = [f for f in formats if f['available'] and (format_id == 'auto' or f['id'] == format_id)]
    if not candidates:
        raise FormatError('This format is unavailable. Refresh the format list; merging video and audio requires FFmpeg.')
    return candidates[-1]


async def download_video_async(url, output_dir=None, filename=None, progress_callback=None, format_id='auto'):
    process = None
    try:
        # Always re-probe: format IDs and availability can change after yt-dlp updates.
        metadata = await probe_video_formats(url)
        selected = choose_format(metadata['formats'], format_id)
        output_dir = os.path.realpath(output_dir or folder_paths.get_input_directory())
        os.makedirs(output_dir, exist_ok=True)
        if filename and (not isinstance(filename, str) or filename in ('.', '..') or re.search(r'[\\/:*?"<>|\x00-\x1f]', filename)):
            raise FormatError('Custom filename must be a filename without directory separators.')
        template = filename.replace('%', '%%') if filename else '%(title)s [%(id)s] [%(format_id)s]'
        marker = '__COMFY_FILE__'
        cmd = [sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-playlist',
               '--encoding', 'utf-8', '--newline', '--progress', '--no-simulate', '-f', selected['selector'],
               '--print', 'after_move:' + marker + '%(filepath)j',
               '-o', os.path.join(output_dir, template + '.%(ext)s')]
        if selected['merges_audio']:
            cmd += ['--merge-output-format', 'mp4/mkv']
        cmd += ['--', validate_url(url)]
        for attempt in range(2):
            process = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
            lines, paths = [], []
            auth_errors = []
            async for line in process.stdout:
                message = line.decode('utf-8', errors='replace').strip()
                if message.startswith(marker):
                    paths.append(json.loads(message[len(marker):]))
                else:
                    if not attempt:
                        auth_errors.append(message)
                    # Retry diagnostics may contain cookie-file contents; forward only download progress.
                    if not attempt or message.startswith('[download]'):
                        lines.append(message)
                        if progress_callback:
                            await progress_callback(message)
                        else:
                            print(message)
            await process.wait()
            if not process.returncode:
                break
            error = '\n'.join(auth_errors) or 'Video download failed.'
            retry = cookie_retry_command(cmd, error) if attempt == 0 else None
            if retry is None:
                raise FormatError(COOKIE_RETRY_ERROR if attempt else error)
            cmd = retry
            message = 'Authentication failed. Retrying once with the server cookie.txt file.'
            if progress_callback:
                await progress_callback(message)
            else:
                print(message)
        if len(paths) != 1 or not os.path.isfile(paths[0]):
            raise FormatError('yt-dlp did not return a completed video file.')
        path = os.path.realpath(paths[0])
        if os.path.commonpath([output_dir, path]) != output_dir:
            raise FormatError('Downloaded file is outside the output directory.')
        return {'success': True, 'downloaded_file': os.path.basename(path), 'output_dir': output_dir,
                'video_path': path, 'format_id': selected['id'], 'stdout': '\n'.join(lines)}
    except asyncio.CancelledError:
        raise
    except Exception as error:
        return {'success': False, 'error': str(error) or 'Video inspection timed out.'}
    finally:
        if process and process.returncode is None:
            process.kill()
            await process.wait()


def download_video(url, output_dir='.'):
    return asyncio.run(download_video_async(url, output_dir))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download a video using currently available formats')
    parser.add_argument('url')
    parser.add_argument('-o', '--output', default='.')
    args = parser.parse_args()
    result = download_video(args.url, args.output)
    print(result)
    sys.exit(0 if result['success'] else 1)
