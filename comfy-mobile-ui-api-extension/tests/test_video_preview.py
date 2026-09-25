import asyncio
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).resolve().parents[1]


class VideoPreviewTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        folders = types.SimpleNamespace()
        for kind in ('input', 'output', 'temp'):
            directory = self.root / kind
            directory.mkdir()
            setattr(folders, f'get_{kind}_directory', lambda directory=directory: str(directory))
        package = types.ModuleType('preview_test_handlers')
        package.__path__ = [str(ROOT / 'handlers')]
        with patch.dict(sys.modules, {'folder_paths': folders, 'preview_test_handlers': package}):
            spec = importlib.util.spec_from_file_location('preview_test_handlers.media_download_handler', ROOT / 'handlers/media_download_handler.py')
            download = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(download)
            with patch.dict(sys.modules, {'preview_test_handlers.media_download_handler': download}):
                spec = importlib.util.spec_from_file_location('preview_test_handlers.video_preview_handler', ROOT / 'handlers/video_preview_handler.py')
                self.handler = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(self.handler)
        app = web.Application()
        app.router.add_post('/thumbnail', self.handler.generate_video_thumbnail)
        app.router.add_post('/preview', self.handler.start_video_preview)
        app.router.add_get('/preview/{key}/status', self.handler.video_preview_status)
        app.router.add_get('/preview/{key}/file', self.handler.serve_video_preview)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        tasks = [job['task'] for job in self.handler.JOBS.values() if 'task' in job and not job['task'].done()]
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await self.client.close()
        self.temp.cleanup()

    async def make_video(self, name='sample.mkv', codec='libx264', audio=True):
        path = self.root / 'input' / name
        command = ['ffmpeg', '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=160x120:r=10:d=0.5']
        if audio:
            command += ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.5']
        command += ['-c:v', codec, '-pix_fmt', 'yuv420p', '-threads', '1']
        if audio:
            command += ['-c:a', 'aac']
        command += [str(path)]
        await self.handler.run_command(command, 30)
        return path

    async def ready_preview(self, path):
        response = await self.client.post('/preview', json={'type': 'input', 'filename': path.name})
        self.assertEqual(response.status, 200, await response.text())
        data = await response.json()
        job = self.handler.JOBS[data['id']]
        if 'task' in job:
            await asyncio.wait_for(job['task'], 30)
        status = await self.client.get('/preview/' + data['id'] + '/status')
        result = await status.json()
        self.assertEqual(result['status'], 'ready', result)
        return result

    async def test_first_frame_thumbnail_and_no_overwrite(self):
        path = await self.make_video()
        before = path.read_bytes()
        response = await self.client.post('/thumbnail', json={'type': 'input', 'filename': path.name})
        self.assertEqual(response.status, 200, await response.text())
        image = await response.json()
        self.assertEqual(image['thumbnail']['filename'], 'sample.png')
        thumbnail = path.with_suffix('.png')
        rgb = await self.handler.run_command(['ffmpeg', '-v', 'error', '-i', str(thumbnail), '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-'], 10)
        self.assertGreater(rgb[0], 200)
        self.assertLess(rgb[1], 30)
        stat = thumbnail.stat().st_mtime_ns
        response = await self.client.post('/thumbnail', json={'type': 'input', 'filename': path.name})
        self.assertEqual(response.status, 200)
        self.assertEqual(thumbnail.stat().st_mtime_ns, stat)
        self.assertEqual(path.read_bytes(), before)

    async def test_preview_remux_range_and_cache_reuse(self):
        path = await self.make_video()
        before = path.read_bytes()
        data = await self.ready_preview(path)
        self.assertEqual(data['mode'], 'remux')
        response = await self.client.get('/preview/' + data['id'] + '/file', headers={'Range': 'bytes=0-15'})
        self.assertEqual(response.status, 206)
        self.assertEqual(response.headers['Content-Type'], 'video/mp4')
        self.assertEqual(len(await response.read()), 16)
        with patch.object(self.handler, 'build_preview', side_effect=AssertionError('Cached file should be reused')):
            again = await self.ready_preview(path)
        self.assertEqual(again['id'], data['id'])
        self.assertEqual(path.read_bytes(), before)
        with path.open('ab') as output:
            output.write(b'changed')
        self.assertNotEqual(self.handler.source_key(path), data['id'])

    async def test_incompatible_video_transcodes_and_silent_video_works(self):
        path = await self.make_video(codec='mpeg4', audio=False)
        data = await self.ready_preview(path)
        self.assertEqual(data['mode'], 'transcode')
        target = self.handler.cache_directory() / (data['id'] + '.mp4')
        info = json.loads(await self.handler.run_command(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(target)], 10))
        self.assertEqual(info['streams'][0]['codec_name'], 'h264')
        self.assertEqual(info['streams'][0]['pix_fmt'], 'yuv420p')
        self.assertEqual(len(info['streams']), 1)

    async def test_audio_only_conversion_and_invalid_video_stream(self):
        args, mode = self.handler.conversion_args([
            {'index': 0, 'codec_type': 'video', 'codec_name': 'h264', 'pix_fmt': 'yuv420p', 'profile': 'High', 'level': 40, 'width': 1280, 'height': 720},
            {'index': 1, 'codec_type': 'audio', 'codec_name': 'opus', 'channels': 2}])
        self.assertEqual(mode, 'remux')
        self.assertEqual(args[args.index('-c:v') + 1], 'copy')
        self.assertEqual(args[args.index('-c:a') + 1], 'aac')
        with self.assertRaises(RuntimeError):
            self.handler.conversion_args([])

    async def test_path_validation_and_missing_tools(self):
        for route in ('/thumbnail', '/preview'):
            for data in [{'filename': '../outside.mkv'}, {'filename': 'C:\\outside.mkv'}, {'filename': 5}, []]:
                response = await self.client.post(route, json=data)
                self.assertEqual(response.status, 400)
        path = self.root / 'input' / 'placeholder.mkv'
        path.write_bytes(b'video')
        with patch.object(self.handler.shutil, 'which', return_value=None):
            for route in ('/thumbnail', '/preview'):
                response = await self.client.post(route, json={'type': 'input', 'filename': path.name})
                self.assertEqual(response.status, 503)

    async def test_audio_suffix_existing_image_and_duplicate_job(self):
        path = await self.make_video('clip-audio.mkv')
        existing = path.with_name('clip.jpg')
        existing.write_bytes(b'keep existing image')
        response = await self.client.post('/thumbnail', json={'type': 'input', 'filename': path.name})
        self.assertEqual((await response.json())['thumbnail']['filename'], 'clip.jpg')
        self.assertEqual(existing.read_bytes(), b'keep existing image')
        from unittest.mock import AsyncMock
        gate = asyncio.Event()
        async def delayed_build(key, path):
            await gate.wait()
        with patch.object(self.handler, 'build_preview', AsyncMock(side_effect=delayed_build)) as build:
            first = await self.client.post('/preview', json={'type': 'input', 'filename': path.name})
            second = await self.client.post('/preview', json={'type': 'input', 'filename': path.name})
            self.assertEqual((await first.json())['id'], (await second.json())['id'])
            self.assertEqual(build.call_count, 1)
            gate.set()
            await asyncio.gather(*(job['task'] for job in self.handler.JOBS.values() if 'task' in job))

    async def test_timeout_kills_process(self):
        from unittest.mock import AsyncMock, Mock
        process = types.SimpleNamespace(returncode=None, kill=Mock(), communicate=AsyncMock(side_effect=[asyncio.TimeoutError(), (b'', b'')]))
        with patch.object(self.handler.asyncio, 'create_subprocess_exec', AsyncMock(return_value=process)):
            with self.assertRaises(asyncio.TimeoutError):
                await self.handler.run_command(['ffmpeg'], 1)
        process.kill.assert_called_once()

    async def test_cleanup_removes_expired_cache_not_active_jobs(self):
        import os
        directory = self.handler.cache_directory()
        old = directory / ('a' * 64 + '.mp4')
        active = directory / ('b' * 64 + '.part.mp4')
        for path in (old, active):
            path.write_bytes(b'video')
            os.utime(path, (1, 1))
        self.handler.JOBS['b' * 64] = {'status': 'converting', 'created': 1}
        self.handler.cleanup_cache()
        self.assertFalse(old.exists())
        self.assertTrue(active.exists())


if __name__ == '__main__':
    unittest.main()
