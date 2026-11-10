import asyncio
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch

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
    async def asyncSetUp(self):
        self.cookie_temp = tempfile.TemporaryDirectory()
        self.cookie_patch = patch.object(video, 'COOKIE_FILE', Path(self.cookie_temp.name) / 'missing-cookie.txt')
        self.cookie_patch.start()

    async def asyncTearDown(self):
        self.cookie_patch.stop()
        self.cookie_temp.cleanup()

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
            self.assertNotIn('--user-agent', spawn.call_args.args)
            self.assertNotIn('--impersonate', spawn.call_args.args)
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
        proc = types.SimpleNamespace(returncode=None, kill=Mock(), communicate=AsyncMock(side_effect=[asyncio.TimeoutError(), (b'', b'')]))
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)):
            with self.assertRaises(asyncio.TimeoutError):
                await video.probe_video_formats('https://example.com/video')
        proc.kill.assert_called_once()

    async def test_custom_user_agent_is_one_argument_before_url(self):
        agent = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0'
        proc = process_result({'formats': [fmt('1')]})
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
            await video.probe_video_formats('https://example.com/video', user_agent=agent)
        command = spawn.call_args.args
        self.assertEqual(command[command.index('--user-agent') + 1], agent)
        self.assertLess(command.index('--user-agent'), command.index('--'))

    async def test_invalid_user_agent_does_not_start_a_process(self):
        for agent in [123, [], 'browser\r\nCookie: secret', 'browser\x00', 'browser\tvalue']:
            with self.subTest(agent=agent), patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock()) as spawn:
                with self.assertRaises(video.FormatError):
                    await video.probe_video_formats('https://example.com/video', user_agent=agent)
                result = await video.download_video_async('https://example.com/video', user_agent=agent)
                self.assertFalse(result['success'])
                spawn.assert_not_awaited()
        for agent in [None, '', '   ']:
            self.assertIsNone(video.validate_user_agent(agent))

    async def test_download_uses_fresh_choice_and_machine_file_path(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / '한글.webm'
            path.write_bytes(b'video')
            stream = asyncio.StreamReader()
            stream.feed_data(('__COMFY_FILE__' + json.dumps(str(path)) + '\n').encode())
            stream.feed_eof()
            proc = types.SimpleNamespace(returncode=0, stdout=stream, wait=AsyncMock())
            metadata = {'formats': video.normalize_formats({'formats': [fmt('new-id')]}, True)}
            with patch.object(video, '_probe_video_formats', AsyncMock(return_value=(metadata, False))) as probe, patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
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
            with patch.object(video, '_probe_video_formats', AsyncMock(return_value=(metadata, False))), patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)):
                result = await video.download_video_async('https://example.com/video', directory)
                self.assertFalse(result['success'])


class CookieAuthenticationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.cookie = Path(self.temp.name) / 'cookie.txt'
        self.cookie.write_text('# Netscape HTTP Cookie File\n')
        self.cookie_patch = patch.object(video, 'COOKIE_FILE', self.cookie)
        self.cookie_patch.start()

    async def asyncTearDown(self):
        self.cookie_patch.stop()
        self.temp.cleanup()

    async def test_probe_retries_authentication_once_with_cookie(self):
        unauthenticated = process_result(stderr=b'ERROR: This content is unreachable. Use --cookies for the authentication.', code=1)
        proc = process_result({'formats': [fmt('private-id')]})
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(side_effect=[unauthenticated, proc])) as spawn:
            result = await video.probe_video_formats('https://www.instagram.com/reel/example/')
        self.assertEqual(result['formats'][0]['id'], 'private-id')
        self.assertEqual(set(result), {'title', 'extractor', 'ffmpeg_available', 'formats'})
        self.assertEqual(spawn.await_count, 2)
        self.assertNotIn('--cookies', spawn.call_args_list[0].args)
        command = spawn.call_args.args
        self.assertEqual(command[command.index('--cookies') + 1], str(self.cookie))
        self.assertLess(command.index('--cookies'), command.index('--'))
        self.assertNotIn('--cookies-from-browser', command)

    async def test_public_probe_ignores_malformed_cookie_file(self):
        self.cookie.write_text('not a Netscape cookie file')
        proc = process_result({'formats': [fmt('public')]})
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
            await video.probe_video_formats('https://youtube.com/shorts/DCYuZLJ1p4Q')
        spawn.assert_awaited_once()
        self.assertNotIn('--cookies', spawn.call_args.args)

    async def test_non_authentication_errors_do_not_use_cookies(self):
        for error in [b'ERROR: Video unavailable', b'ERROR: HTTP Error 403: Forbidden',
                      b'WARNING: Use --cookies for authentication\nERROR: Requested format is not available']:
            with self.subTest(error=error):
                proc = process_result(stderr=error, code=1)
                with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
                    with self.assertRaises(video.FormatError) as caught:
                        await video.probe_video_formats('https://example.com/video')
                spawn.assert_awaited_once()
                self.assertNotIn('--cookies', spawn.call_args.args)
                self.assertEqual(str(caught.exception), error.decode())

    async def test_probe_without_cookie_and_no_retry(self):
        self.cookie.unlink()
        for proc in [process_result({'formats': [fmt('public')]}), process_result(stderr=b'Login required', code=1)]:
            with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
                if proc.returncode:
                    with self.assertRaisesRegex(video.FormatError, 'Login required'):
                        await video.probe_video_formats('https://example.com/video')
                else:
                    await video.probe_video_formats('https://example.com/video')
                spawn.assert_awaited_once()
                self.assertNotIn('--cookies', spawn.call_args.args)

    async def test_cookie_failure_is_not_retried_or_exposed(self):
        unauthenticated = process_result(stderr=b'ERROR: Login required', code=1)
        proc = process_result(stderr=b'Invalid cookie file: secret-test-cookie', code=1)
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(side_effect=[unauthenticated, proc])) as spawn:
            with self.assertRaisesRegex(video.FormatError, 'Cookie-authenticated') as error:
                await video.probe_video_formats('https://example.com/video')
        self.assertEqual(spawn.await_count, 2)
        self.assertNotIn('secret-test-cookie', str(error.exception))

    async def test_cookie_retry_timeout_or_cancellation_stops_process(self):
        unauthenticated = process_result(stderr=b'ERROR: Login required', code=1)
        for failure in (asyncio.TimeoutError, asyncio.CancelledError):
            proc = types.SimpleNamespace(returncode=None, kill=Mock(), communicate=AsyncMock(side_effect=[failure(), (b'', b'')]))
            with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(side_effect=[unauthenticated, proc])):
                with self.assertRaises(failure):
                    await video.probe_video_formats('https://example.com/video')
            proc.kill.assert_called_once()

    def download_process(self, text, code):
        stream = asyncio.StreamReader()
        stream.feed_data(text.encode())
        stream.feed_eof()
        return types.SimpleNamespace(returncode=code, stdout=stream, wait=AsyncMock())

    async def test_cookie_applied_to_both_probe_and_download(self):
        target = Path(self.temp.name) / 'video.mp4'
        target.write_bytes(b'video')
        probe = process_result({'formats': [fmt('chosen')]})
        unauthenticated = process_result(stderr=b'ERROR: Login required', code=1)
        download = self.download_process('WARNING: secret-test-cookie\n[download] 100%\n__COMFY_FILE__' + json.dumps(str(target)) + '\n', 0)
        progress = AsyncMock()
        agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/143.0.0.0'
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(side_effect=[unauthenticated, probe, download])) as spawn:
            result = await video.download_video_async('https://example.com/video', self.temp.name, format_id='chosen', progress_callback=progress, user_agent=agent, impersonate='chrome-136:windows-10')
        self.assertTrue(result['success'], result)
        self.assertEqual(result['downloaded_file'], 'video.mp4')
        self.assertEqual(spawn.await_count, 3)
        for call in spawn.call_args_list:
            self.assertEqual(call.args[call.args.index('--user-agent') + 1], agent)
            self.assertEqual(call.args.count('--user-agent'), 1)
            self.assertEqual(call.args[call.args.index('--impersonate') + 1], 'chrome-136:windows-10')
            self.assertEqual(call.args.count('--impersonate'), 1)
        self.assertNotIn('--cookies', spawn.call_args_list[0].args)
        for call in spawn.call_args_list[1:]:
            self.assertEqual(call.args[call.args.index('--cookies') + 1], str(self.cookie))
        command = spawn.call_args.args
        self.assertEqual(command[command.index('-f') + 1], 'chosen')
        self.assertNotIn('secret-test-cookie', result['stdout'])
        self.assertNotIn('secret-test-cookie', str(progress.call_args_list))

    async def test_public_download_does_not_add_existing_cookies(self):
        self.cookie.write_text('not a Netscape cookie file')
        target = Path(self.temp.name) / 'public.mp4'
        target.write_bytes(b'video')
        probe = process_result({'formats': [fmt('public')]})
        download = self.download_process('__COMFY_FILE__' + json.dumps(str(target)) + '\n', 0)
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(side_effect=[probe, download])) as spawn:
            result = await video.download_video_async('https://youtube.com/shorts/DCYuZLJ1p4Q', self.temp.name)
        self.assertTrue(result['success'], result)
        self.assertEqual(spawn.await_count, 2)
        for call in spawn.call_args_list:
            self.assertNotIn('--cookies', call.args)
            self.assertNotIn('--user-agent', call.args)
            self.assertNotIn('--impersonate', call.args)

    async def test_download_failures_never_retry_without_cookies(self):
        metadata = {'formats': video.normalize_formats({'formats': [fmt('chosen')]}, True)}
        for using_cookies in (True, False):
            proc = self.download_process('ERROR: Login required secret-test-cookie\n', 1)
            with patch.object(video, '_probe_video_formats', AsyncMock(return_value=(metadata, using_cookies))), patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
                result = await video.download_video_async('https://example.com/video', self.temp.name, progress_callback=AsyncMock())
            self.assertFalse(result['success'])
            spawn.assert_awaited_once()
            self.assertEqual('--cookies' in spawn.call_args.args, using_cookies)
            if using_cookies:
                self.assertNotIn('secret-test-cookie', result['error'])


class ImpersonationTests(unittest.IsolatedAsyncioTestCase):
    async def test_lists_only_installed_targets(self):
        output = b'[info] Available impersonate targets\nClient OS Source\n----------------\nChrome-136 Windows-10 curl_cffi\nSafari-18.0 Macos-15 curl_cffi\nChrome - curl_cffi\nTor - curl_cffi>=0.11 (unavailable)\n'
        proc = types.SimpleNamespace(returncode=0, communicate=AsyncMock(return_value=(output, b'')))
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
            self.assertEqual(await video.get_impersonate_targets(), ['chrome-136:windows-10', 'safari-18.0:macos-15', 'chrome'])
        self.assertIn('--list-impersonate-targets', spawn.call_args.args)
        self.assertNotIn('--cookies', spawn.call_args.args)
        proc.communicate.return_value = (b'Client OS Source\nChrome - curl_cffi (unavailable)\n', b'')
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)):
            self.assertEqual(await video.get_impersonate_targets(), [])

    async def test_list_failure_and_timeout(self):
        proc = process_result(code=1)
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)):
            with self.assertRaises(video.FormatError):
                await video.get_impersonate_targets()
        for failure in (asyncio.TimeoutError, asyncio.CancelledError):
            proc = types.SimpleNamespace(returncode=None, kill=Mock(), communicate=AsyncMock(side_effect=[failure(), (b'', b'')]))
            with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)):
                with self.assertRaises(failure):
                    await video.get_impersonate_targets()
            proc.kill.assert_called_once()

    async def test_auto_and_invalid_targets(self):
        proc = process_result({'formats': [fmt('public')]})
        with patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock(return_value=proc)) as spawn:
            await video.probe_video_formats('https://example.com/video', impersonate='auto')
        self.assertEqual(spawn.call_args.args[spawn.call_args.args.index('--impersonate') + 1], '')
        for value in [123, True, [], '--cookies', 'chrome --proxy=secret', 'chrome\nfirefox', '../chrome']:
            with self.subTest(value=value), patch.object(video.asyncio, 'create_subprocess_exec', AsyncMock()) as spawn:
                with self.assertRaises(video.FormatError):
                    await video.probe_video_formats('https://example.com/video', impersonate=value)
                spawn.assert_not_awaited()


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
        app.router.add_post('/download', self.handler.download_youtube_video)
        app.router.add_get('/status', self.handler.get_video_download_status)
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

    async def test_user_agent_is_forwarded_by_both_endpoints(self):
        agent = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0'
        url = 'https://example.com/video'
        with patch.object(self.handler, 'probe_video_formats', AsyncMock(return_value={'formats': []})) as probe:
            response = await self.client.post('/formats', json={'url': url, 'user_agent': agent, 'impersonate': 'chrome'})
            self.assertEqual(response.status, 200)
            probe.assert_awaited_once_with(url, user_agent=agent, impersonate='chrome')
        with tempfile.TemporaryDirectory() as directory:
            with patch('builtins.print'), patch.object(self.handler.folder_paths, 'get_input_directory', return_value=directory, create=True), patch.object(self.handler, 'download_video_async', AsyncMock(return_value={'success': False, 'error': 'test download'})) as download:
                response = await self.client.post('/download', json={'url': url, 'user_agent': agent, 'impersonate': 'chrome'})
                self.assertEqual(response.status, 500)
                self.assertEqual(download.call_args.kwargs['user_agent'], agent)
                self.assertEqual(download.call_args.kwargs['impersonate'], 'chrome')

    async def test_status_reports_targets_without_breaking_other_capabilities(self):
        for value in (['chrome-136:windows-10'], video.FormatError('not supported')):
            listing = AsyncMock(side_effect=value) if isinstance(value, Exception) else AsyncMock(return_value=value)
            with patch.object(self.handler.subprocess, 'run', return_value=types.SimpleNamespace(stdout='test-version')), patch.object(self.handler.folder_paths, 'get_input_directory', return_value=tempfile.gettempdir(), create=True), patch.object(self.handler, 'get_impersonate_targets', listing):
                response = await self.client.get('/status')
                self.assertEqual(response.status, 200)
                status = (await response.json())['status']
                self.assertTrue(status['yt_dlp_available'])
                self.assertEqual(status['impersonate_targets'], [] if isinstance(value, Exception) else value)
                self.assertEqual(bool(status['impersonate_error']), isinstance(value, Exception))

    async def test_endpoints_reject_header_injection_before_processing(self):
        for path in ['/formats', '/download']:
            with patch.object(self.handler, 'probe_video_formats', AsyncMock()) as probe, patch.object(self.handler, 'download_video_async', AsyncMock()) as download:
                response = await self.client.post(path, json={'url': 'https://example.com/video', 'user_agent': 'browser\r\nCookie: secret'})
                self.assertEqual(response.status, 400)
                probe.assert_not_awaited()
                download.assert_not_awaited()

    async def test_endpoints_reject_invalid_impersonation(self):
        for path in ['/formats', '/download']:
            with patch.object(self.handler, 'probe_video_formats', AsyncMock()) as probe, patch.object(self.handler, 'download_video_async', AsyncMock()) as download:
                response = await self.client.post(path, json={'url': 'https://example.com/video', 'impersonate': '--cookies'})
                self.assertEqual(response.status, 400)
                probe.assert_not_awaited()
                download.assert_not_awaited()

    async def test_timeout_is_actionable(self):
        with patch.object(self.handler, 'probe_video_formats', AsyncMock(side_effect=asyncio.TimeoutError)):
            response = await self.client.post('/formats', json={'url': 'https://example.com/video'})
        self.assertEqual(response.status, 504)
        self.assertIn('timed out', (await response.json())['error'])


if __name__ == '__main__':
    unittest.main()
