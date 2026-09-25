import asyncio
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('video_download_under_test', ROOT / 'utils/download_video.py')
video = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {'folder_paths': types.SimpleNamespace()}):
    spec.loader.exec_module(video)


def fmt(id, video_codec='avc1', audio_codec='mp4a', **extra):
    return dict(format_id=id, vcodec=video_codec, acodec=audio_codec, url='https://cdn.example/video', ext='mp4', **extra)


def process_result(info=None, stderr=b'', code=0):
    return types.SimpleNamespace(returncode=code, communicate=AsyncMock(return_value=(json.dumps(info).encode(), stderr)))


class FormatTests(unittest.IsolatedAsyncioTestCase):
    def test_youtube_separate_audio_and_video_and_ffmpeg_fallback(self):
        info = {'formats': [fmt('audio', 'none', 'opus'), fmt('18'), fmt('137', 'avc1', 'none', height=1080)]}
        options = video.normalize_formats(info, True)
        self.assertEqual(video.choose_format(options)['selector'], '137+audio')
        self.assertEqual(video.choose_format(options, '18')['selector'], '18')
        options = video.normalize_formats(info, False)
        self.assertEqual(video.choose_format(options)['id'], '18')
        with self.assertRaises(video.FormatError):
            video.choose_format(options, '137')

    def test_instagram_progressive_and_silent_video(self):
        options = video.normalize_formats({'formats': [fmt('low'), fmt('high')]}, False)
        self.assertEqual(video.choose_format(options)['selector'], 'high')
        silent = video.normalize_formats({'formats': [fmt('silent', 'h264', 'none')]}, False)
        self.assertFalse(silent[0]['has_audio'])
        self.assertTrue(silent[0]['available'])

    def test_direct_video_with_unknown_codecs_is_preserved(self):
        options = video.normalize_formats({'formats': [fmt('direct', None, None)]}, False)
        self.assertEqual(video.choose_format(options)['selector'], 'direct')
        self.assertFalse(options[0]['merges_audio'])

    def test_rejects_stale_ids_and_selector_expressions(self):
        options = video.normalize_formats({'formats': [fmt('18')]}, True)
        for id in ['137', '18/best', '18+18', None]:
            with self.assertRaises(video.FormatError):
                video.choose_format(options, id)

    def test_filters_drm_storyboard_and_audio(self):
        info = {'formats': [fmt('drm', has_drm=True), fmt('sb', protocol='mhtml'), fmt('audio', 'none'), fmt('valid')]}
        self.assertEqual([f['id'] for f in video.normalize_formats(info, True)], ['valid'])
        for info in [{'formats': []}, {'_type': 'playlist', 'entries': []}]:
            with self.assertRaises(video.FormatError):
                video.normalize_formats(info, True)

    async def test_probe_uses_fresh_json_process_and_http_url(self):
        proc = process_result({'title': 'A video', 'extractor_key': 'Instagram', 'formats': [fmt('1')]})
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn, patch.object(video.shutil, 'which', return_value=None):
            result = await video.probe_video_formats('https://example.com/video')
            self.assertEqual(result['extractor'], 'Instagram')
            self.assertIn('--dump-single-json', spawn.call_args.args)
            self.assertEqual(spawn.call_args.args[-2:], ('--', 'https://example.com/video'))
            self.assertFalse(result['ffmpeg_available'])
        for url in [None, 'file:///tmp/video', '--help', 'ftp://example.com/video']:
            with self.assertRaises(video.FormatError):
                await video.probe_video_formats(url)

    async def test_probe_failure_and_timeout(self):
        proc = process_result(stderr=b'Login required', code=1)
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)):
            with self.assertRaisesRegex(video.FormatError, 'Login required'):
                await video.probe_video_formats('https://example.com/video')
        from unittest.mock import Mock
        proc = types.SimpleNamespace(returncode=None, kill=Mock(), communicate=AsyncMock(side_effect=[asyncio.TimeoutError(), (b'', b'')]))
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)):
            with self.assertRaises(asyncio.TimeoutError):
                await video.probe_video_formats('https://example.com/video')
        proc.kill.assert_called_once()

    async def test_download_uses_fresh_choice_and_machine_file_path(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '한글.webm'
            path.write_bytes(b'video')
            stream = asyncio.StreamReader()
            stream.feed_data(('__COMFY_FILE__' + json.dumps(str(path)) + '\n').encode())
            stream.feed_eof()
            proc = types.SimpleNamespace(returncode=0, stdout=stream, wait=AsyncMock())
            metadata = {'formats': video.normalize_formats({'formats': [fmt('new-id')]}, True)}
            with patch.object(video, 'probe_video_formats', AsyncMock(return_value=metadata)) as probe, patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
                result = await video.download_video_async('https://example.com/video', directory)
                self.assertTrue(result['success'], result)
                self.assertEqual(result['downloaded_file'], '한글.webm')
                self.assertEqual(spawn.call_args.args[spawn.call_args.args.index('-f') + 1], 'new-id')
                self.assertIn('after_move:__COMFY_FILE__%(filepath)j', spawn.call_args.args)
                probe.assert_awaited_once()

    async def test_missing_path_does_not_report_unrelated_file(self):
        with tempfile.TemporaryDirectory() as directory:
            (Path(directory) / 'unrelated.mp4').write_bytes(b'old video')
            stream = asyncio.StreamReader()
            stream.feed_eof()
            proc = types.SimpleNamespace(returncode=0, stdout=stream, wait=AsyncMock())
            metadata = {'formats': video.normalize_formats({'formats': [fmt('18')]}, True)}
            with patch.object(video, 'probe_video_formats', AsyncMock(return_value=metadata)), patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)):
                result = await video.download_video_async('https://example.com/video', directory)
                self.assertFalse(result['success'])


class FormatApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from aiohttp import web
        from aiohttp.test_utils import TestClient, TestServer
        package = types.ModuleType('video_test_package')
        package.__path__ = [str(ROOT)]
        thumbnail = types.ModuleType('video_test_package.utils.video_thumbnail')
        thumbnail.generate_video_thumbnail_async = AsyncMock(return_value={'success': False})
        source = ROOT / 'handlers/video_download_handler.py'
        spec = importlib.util.spec_from_file_location('video_test_package.handlers.video_download_handler', source)
        self.handler = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {
            'video_test_package': package,
            'video_test_package.utils.download_video': video,
            'video_test_package.utils.video_thumbnail': thumbnail,
            'folder_paths': types.SimpleNamespace(),
        }):
            spec.loader.exec_module(self.handler)
        app = web.Application()
        app.router.add_post('/formats', self.handler.get_video_formats)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()

    async def test_returns_ranked_public_formats_without_media_urls(self):
        metadata = {'title': 'Video', 'extractor': 'YouTube', 'ffmpeg_available': True,
                    'formats': video.normalize_formats({'formats': [fmt('low'), fmt('high')]}, True)}
        with patch.object(self.handler, 'probe_video_formats', AsyncMock(return_value=metadata)):
            response = await self.client.post('/formats', json={'url': 'https://example.com/video'})
        self.assertEqual(response.status, 200)
        data = await response.json()
        self.assertEqual(data['formats'][0]['id'], 'high')
        self.assertNotIn('selector', data['formats'][0])
        self.assertNotIn('url', data['formats'][0])

    async def test_bad_requests_do_not_start_probe(self):
        with patch.object(self.handler, 'probe_video_formats', AsyncMock()) as probe:
            for payload in [{}, {'url': 'file:///tmp/test'}, [], {'url': 123}]:
                response = await self.client.post('/formats', json=payload)
                self.assertEqual(response.status, 400)
            probe.assert_not_awaited()

    async def test_timeout_is_actionable(self):
        with patch.object(self.handler, 'probe_video_formats', AsyncMock(side_effect=asyncio.TimeoutError)):
            response = await self.client.post('/formats', json={'url': 'https://example.com/video'})
        self.assertEqual(response.status, 504)
        self.assertIn('timed out', (await response.json())['error'])


if __name__ == '__main__':
    unittest.main()
