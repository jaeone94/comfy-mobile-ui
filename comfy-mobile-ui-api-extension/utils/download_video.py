import argparse
import asyncio
import json
import os
import re
import shutil
import sys
from urllib.parse import urlparse

import folder_paths


class FormatError(ValueError):
    pass


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
    process = await asyncio.create_subprocess_exec(
        sys.executable, '-m', 'yt_dlp', '--ignore-config', '--no-playlist',
        '--dump-single-json', '--skip-download', '--no-warnings', '--encoding', 'utf-8', '--', url,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    try:
        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=90)
    except (asyncio.TimeoutError, asyncio.CancelledError):
        if process.returncode is None:
            process.kill()
        await process.communicate()
        raise
    if process.returncode:
        raise FormatError(stderr.decode('utf-8', errors='replace').strip() or 'Could not inspect this video.')
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
        process = await asyncio.create_subprocess_exec(*cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        lines, paths = [], []
        async for line in process.stdout:
            message = line.decode('utf-8', errors='replace').strip()
            if message.startswith(marker):
                paths.append(json.loads(message[len(marker):]))
            else:
                lines.append(message)
                if progress_callback:
                    await progress_callback(message)
                else:
                    print(message)
        await process.wait()
        if process.returncode:
            raise FormatError('\n'.join(lines[-20:]) or 'Video download failed.')
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
