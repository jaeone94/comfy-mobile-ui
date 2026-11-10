// Run against Vite with Playwright installed or VIDEO_PLAYWRIGHT_PATH set.
const { chromium } = require(process.env.VIDEO_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const baseUrl = process.env.VIDEO_TEST_BASE_URL || 'http://127.0.0.1:5174';
fs.mkdirSync('tests/output', { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 360, height: 800 }]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('i18nextLng', 'en');
        localStorage.setItem('comfy-mobile-connection', JSON.stringify({ state: { autoReconnectEnabled: false }, version: 0 }));
      });
      const requests = [];
      let releaseSlow;
      let slowNext = false;
      let impersonateTargets = ['chrome-136:windows-10', 'safari-18.0:macos-15'];
      await page.route('**/comfymobile/api/**', async route => {
        const path = new URL(route.request().url()).pathname;
        const body = route.request().method() === 'POST' ? route.request().postDataJSON() : null;
        requests.push({ path, body });
        let json = { success: true };
        if (path.endsWith('/download/status')) {
          json.status = { yt_dlp_available: true, yt_dlp_version: 'test', input_directory: 'input', input_writable: true, supported_sites: ['YouTube', 'TikTok', 'Instagram'], impersonate_targets: impersonateTargets };
        } else if (path.endsWith('/formats')) {
          const slow = slowNext;
          slowNext = false;
          if (slow) await new Promise(resolve => { releaseSlow = resolve; });
          json = { success: true, title: slow ? 'Stale response' : 'Test video', extractor: 'Test', ffmpeg_available: true,
            formats: [{ id: 'test-format', ext: 'mp4', resolution: '1080p', fps: 30, vcodec: 'h264', has_audio: true, requires_ffmpeg: false, merges_audio: false, available: true }] };
        } else if (path.endsWith('/videos/download')) {
          json = { success: false, error: 'Synthetic download; no network transfer' };
        }
        await route.fulfill({ json }).catch(error => {
          if (!route.request().failure()) throw error;
        });
      });
      await page.goto(`${baseUrl}/videos/download`);
      await page.evaluate(async () => {
        const { useConnectionStore } = await import('/src/ui/store/connectionStore.ts');
        useConnectionStore.setState({ url: location.origin, isConnected: true, hasExtension: true, isCheckingExtension: false, autoReconnectEnabled: false });
      });
      const agent = page.locator('#video-user-agent');
      const format = page.locator('#video-format');
      const impersonate = page.locator('#video-impersonate');
      const load = page.getByRole('button', { name: 'Load formats', exact: true });
      const download = page.getByRole('button', { name: 'Download Video', exact: true });
      await agent.waitFor();
      await page.locator('#video-url').fill('https://example.com/video');
      assert.equal(await agent.locator('option').count(), 7);
      assert.equal(await impersonate.locator('option').count(), 4);

      for (const preset of ['default', 'opera-windows', 'chrome-windows', 'firefox-linux', 'firefox-ubuntu', 'chrome-linux', 'custom']) {
        await agent.selectOption(preset);
        if (preset === 'custom') {
          assert.equal(await load.isDisabled(), true);
          assert.equal(await download.isDisabled(), true);
          await page.locator('#video-custom-user-agent').fill('Mozilla/5.0 Custom/1.0');
        }
        assert.equal(await format.inputValue(), 'auto');
        const expectedAgent = preset === 'default' ? undefined : await agent.getAttribute('title');
        const response = page.waitForResponse(r => r.url().endsWith('/videos/formats'));
        await load.click();
        await response;
        await format.locator('option[value="test-format"]').waitFor({ state: 'attached' });
        assert.equal(requests.filter(r => r.path.endsWith('/formats')).at(-1).body.user_agent, expectedAgent);
        await format.selectOption('test-format');
        const sent = page.waitForRequest(r => r.url().endsWith('/videos/download'));
        await download.click();
        const payload = (await sent).postDataJSON();
        assert.equal(payload.user_agent, expectedAgent);
        assert.equal(payload.impersonate, undefined);
        assert.equal(payload.format_id, 'test-format');
        await agent.waitFor({ state: 'visible' });
        await page.waitForFunction(() => !document.querySelector('#video-user-agent').disabled);
      }

      for (const target of ['auto', ...impersonateTargets, '']) {
        await impersonate.selectOption(target);
        assert.equal(await format.inputValue(), 'auto');
        const response = page.waitForResponse(r => r.url().endsWith('/videos/formats'));
        await load.click();
        await response;
        await format.locator('option[value="test-format"]').waitFor({ state: 'attached' });
        assert.equal(requests.filter(r => r.path.endsWith('/formats')).at(-1).body.impersonate, target || undefined);
        await format.selectOption('test-format');
        const sent = page.waitForRequest(r => r.url().endsWith('/videos/download'));
        await download.click();
        assert.equal((await sent).postDataJSON().impersonate, target || undefined);
        await page.waitForFunction(() => !document.querySelector('#video-impersonate').disabled);
      }

      await page.locator('#video-custom-user-agent').fill('Mozilla/5.0 ' + 'A'.repeat(600));
      assert.equal(await format.inputValue(), 'auto');
      assert.equal(await format.locator('option').count(), 1);
      slowNext = true;
      const pending = page.waitForRequest(r => r.url().endsWith('/videos/formats'));
      await load.click();
      await pending;
      await impersonate.selectOption('chrome-136:windows-10');
      assert.equal(await format.inputValue(), 'auto');
      releaseSlow();
      const fresh = page.waitForResponse(r => r.url().endsWith('/videos/formats'));
      await load.click();
      await fresh;
      await page.getByText('Test · Test video', { exact: true }).waitFor();
      assert.equal(await page.getByText('Stale response', { exact: false }).count(), 0);
      await agent.selectOption('custom');
      await page.locator('#video-custom-user-agent').scrollIntoViewIfNeeded();
      for (const control of [agent, page.locator('#video-custom-user-agent'), impersonate, format]) {
        const box = await control.boundingBox();
        assert.ok(box.x >= 0 && box.x + box.width <= viewport.width, 'control fits viewport');
      }
      await page.screenshot({ path: `tests/output/video-user-agent-${viewport.width}.png` });
      impersonateTargets = [];
      await page.reload();
      await page.evaluate(async () => {
        const { useConnectionStore } = await import('/src/ui/store/connectionStore.ts');
        useConnectionStore.setState({ url: location.origin, isConnected: true, hasExtension: true, isCheckingExtension: false, autoReconnectEnabled: false });
      });
      await impersonate.waitFor();
      assert.equal(await impersonate.isDisabled(), true);
      assert.equal(await impersonate.inputValue(), '');
      await page.locator('#video-url').fill('https://example.com/video');
      const anonymous = page.waitForResponse(r => r.url().endsWith('/videos/formats'));
      await load.click();
      await anonymous;
      assert.equal(requests.filter(r => r.path.endsWith('/formats')).at(-1).body.impersonate, undefined);
      assert.deepEqual(pageErrors, []);
      console.log(`PASS ${viewport.width}px: User-Agent and impersonation payloads, resets, cancellation, unavailable targets and layout`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
