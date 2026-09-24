import importlib.util
import sys
import tempfile
import types
import unittest
from pathlib import Path
from urllib.parse import quote
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer


class MediaDownloadTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        folders = types.SimpleNamespace()
        for kind in ("input", "output", "temp"):
            root = self.root / kind
            root.mkdir()
            setattr(folders, f"get_{kind}_directory", lambda root=root: str(root))
        source = Path(__file__).resolve().parents[1] / "handlers" / "media_download_handler.py"
        spec = importlib.util.spec_from_file_location("media_download_test_handler", source)
        self.handler = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"folder_paths": folders}):
            spec.loader.exec_module(self.handler)
        app = web.Application()
        app.router.add_get('/comfymobile/api/files/download', self.handler.download_media)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.temp.cleanup()

    async def test_original_file_unicode_name_head_and_video_range(self):
        payload = bytes(range(256)) * 1024
        for kind in ("input", "output", "temp"):
            folder = self.root / kind / "nested"
            folder.mkdir()
            filename = '한글 영상.mp4'
            (folder / filename).write_bytes(payload)
            params = {"filename": filename, "subfolder": "nested", "type": kind, "preview": "true"}
            response = await self.client.get('/comfymobile/api/files/download', params=params)
            self.assertEqual(response.status, 200)
            self.assertEqual(await response.read(), payload)
            self.assertTrue(response.headers['Content-Disposition'].startswith('attachment;'))
            self.assertIn("filename*=UTF-8''" + quote(filename), response.headers['Content-Disposition'])
            self.assertEqual(int(response.headers['Content-Length']), len(payload))
            response = await self.client.head('/comfymobile/api/files/download', params=params)
            self.assertEqual(response.status, 200)
            self.assertEqual(await response.read(), b'')
            response = await self.client.get('/comfymobile/api/files/download', params=params,
                                             headers={"Range": "bytes=10-29"})
            self.assertEqual(response.status, 206)
            self.assertEqual(await response.read(), payload[10:30])
            self.assertTrue(response.headers['Content-Disposition'].startswith('attachment;'))

    async def test_invalid_paths_and_missing_files(self):
        for params in ({}, {"filename": "missing.png"}, {"filename": "."},
                       {"filename": "x", "type": "models"},
                       {"filename": "../outside.txt"}, {"filename": "..\\outside.txt"},
                       {"filename": "/etc/passwd"}, {"filename": "C:\\private.txt"},
                       {"filename": "x", "subfolder": "../input"},
                       {"filename": "x\r\nheader.png"}, {"filename": "file:stream"}):
            response = await self.client.get('/comfymobile/api/files/download', params=params)
            self.assertIn(response.status, (400, 404), params)
        outside = self.root / 'outside.txt'
        outside.write_text('outside')
        link = self.root / 'output' / 'escape.txt'
        try:
            link.symlink_to(outside)
        except OSError:
            return  # Windows may require a symlink privilege.
        response = await self.client.get('/comfymobile/api/files/download', params={"filename": "escape.txt"})
        self.assertEqual(response.status, 400)


if __name__ == '__main__':
    unittest.main()
