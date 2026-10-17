// Run against npm run dev with Playwright installed or GALLERY_PLAYWRIGHT_PATH
// pointing to a bundled installation. Chrome uses an isolated headless profile.
const { chromium } = require(process.env.GALLERY_PLAYWRIGHT_PATH || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
fs.mkdirSync('tests/output', { recursive: true });
const baselineRef = process.env.GALLERY_BASELINE_REF || 'main';
const source = execFileSync('git', ['show', `${baselineRef}:src/components/media/OutputsGallery.tsx`], { encoding: 'utf8' });
fs.writeFileSync('tests/output/gallery-baseline.tsx', source
  .replace("'../modals/FilePreviewModal'", "'@/components/modals/FilePreviewModal'")
  .replace("'../ui/SimpleConfirmDialog'", "'@/components/ui/SimpleConfirmDialog'")
  .replace("'./VirtualGalleryGrid'", "'@/components/media/VirtualGalleryGrid'"));
const baseUrl = process.env.GALLERY_TEST_BASE_URL || 'http://127.0.0.1:5173';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6l8AAAAASUVORK5CYII=', 'base64');
const imageCount = 2000;
const images = Array.from({ length: imageCount }, (_, index) => ({ filename: `frame_${String(index).padStart(5, '0')}.png`,
  type: 'output', subfolder: 'album', modified: imageCount - index }));
const videos = Array.from({ length: 20 }, (_, index) => ({ filename: `clip_${index}.mp4`, type: 'output', subfolder: 'album', modified: index }));

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const results = {};
    for (const baseline of [true, false]) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.stack));
      let listRequests = 0;
      await page.route('**/comfymobile/api/files/list', route => {
        listRequests++;
        return route.fulfill({ json: { status: 'success', images, videos, files: [] } });
      });
      await page.route('**/comfymobile/api/files/view?*', route => route.fulfill({ contentType: 'image/png', body: png }));
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await page.goto(`${baseUrl}/tests/browser/gallery.html${baseline ? '?baseline' : ''}`);
      await page.locator('img').first().waitFor();
      await page.waitForTimeout(900);
      const mounted = await page.locator('img').count();
      if (!baseline) assert.ok(mounted < 60, `only nearby images mounted: ${mounted}`);
      async function measure(action) {
        await page.evaluate(() => Object.assign(window.galleryMetrics, { renders: 0, duration: 0, urlBuilds: 0 }));
        const started = performance.now();
        await action();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        return { ...await page.evaluate(() => ({ ...window.galleryMetrics })), elapsed: performance.now() - started };
      }
      const enter = await measure(() => page.getByTitle('Enter selection mode').click());
      const selectOne = await measure(() => page.locator('img').nth(0).click());
      const ws = await measure(() => page.evaluate(() => window.notifyWs()));
      const exit = await measure(() => page.getByTitle('Exit selection mode').click());
      if (!baseline) {
        assert.ok(selectOne.urlBuilds <= 2, `only selected card rerenders: ${selectOne.urlBuilds}`);
        assert.equal(ws.urlBuilds, 0, 'WebSocket update does not rebuild thumbnails');
        await page.getByTitle('Enter selection mode').click();
        const nativeGuards = await page.locator('[data-gallery-index]').first().evaluate(cell => {
          const caption = cell.querySelector('p');
          return {
            userSelect: getComputedStyle(caption).userSelect,
            webkitUserSelect: getComputedStyle(caption).webkitUserSelect,
            selectBlocked: !caption.dispatchEvent(new Event('selectstart', { bubbles: true, cancelable: true })),
            menuBlocked: !caption.dispatchEvent(new Event('contextmenu', { bubbles: true, cancelable: true })),
            dragBlocked: !cell.querySelector('img').dispatchEvent(new Event('dragstart', { bubbles: true, cancelable: true })),
          };
        });
        assert.deepEqual(nativeGuards, { userSelect: 'none', webkitUserSelect: 'none',
          selectBlocked: true, menuBlocked: true, dragBlocked: true }, 'native text selection and image menus are blocked in selection mode');
        await page.locator('img').first().click();
        // Mouse range selection remains useful on desktops and in browser tests.
        const cells = page.locator('[data-gallery-index]');
        const a = await cells.nth(1).boundingBox();
        const b = await cells.nth(8).boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
        await page.mouse.up();
        await page.getByText('9 selected', { exact: false }).waitFor();
        await page.screenshot({ path: 'tests/output/gallery-selection-mobile.png' });
        // Reverse a range, preserving selections that predate the gesture.
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2, { steps: 12 });
        await page.mouse.up();
        await page.getByText('8 selected', { exact: false }).waitFor();
        await page.getByTitle('Exit selection mode').click();
        await page.getByTitle('Enter selection mode').click();
        const touchStart = await cells.nth(0).boundingBox();
        const touchEnd = await cells.nth(8).boundingBox();
        const startPoint = { x: touchStart.x + touchStart.width / 2, y: touchStart.y + touchStart.height / 2 };
        const endPoint = { x: touchEnd.x + touchEnd.width / 2, y: touchEnd.y + touchEnd.height / 2 };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [startPoint] });
        await page.waitForTimeout(350);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [endPoint] });
        await page.waitForTimeout(80);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.getByText('9 selected', { exact: false }).waitFor();
        await page.getByTitle('Exit selection mode').click();
        await page.getByTitle('Enter selection mode').click();
        // Native-gallery gesture: start sideways immediately, then continue
        // vertically across more rows without a long-press delay.
        const beside = await cells.nth(1).boundingBox();
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [startPoint] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: beside.x + beside.width / 2, y: startPoint.y }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [endPoint] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.getByText('9 selected', { exact: false }).waitFor();
        assert.equal(await page.locator('.fixed.inset-0.overflow-y-auto').evaluate(el => el.scrollTop), 0,
          'horizontal selection takes ownership before native scrolling');
        // Holding near the bottom scrolls the virtual grid and extends selection.
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [startPoint] });
        await page.waitForTimeout(350);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 800 }] });
        await page.waitForTimeout(700);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        assert.ok(await page.locator('.fixed.inset-0.overflow-y-auto').evaluate(el => el.scrollTop) > 100, 'edge drag auto-scrolls');
        assert.ok(await page.locator('img').count() < 60, 'auto-scroll keeps DOM bounded');
        // A quick vertical touch is a native scroll, with selection unchanged.
        const label = await page.locator('header p').first().innerText();
        const beforeScroll = await page.locator('.fixed.inset-0.overflow-y-auto').evaluate(el => el.scrollTop);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 500 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y: 250 }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await page.waitForTimeout(150);
        assert.equal(await page.locator('header p').first().innerText(), label, 'quick swipe leaves selection intact');
        assert.ok(await page.locator('.fixed.inset-0.overflow-y-auto').evaluate(el => el.scrollTop) > beforeScroll, 'quick swipe scrolls normally');
        // Reach the last partial row; tab changes must not refetch the same listing.
        await page.locator('.fixed.inset-0.overflow-y-auto').evaluate(el => { el.scrollTop = el.scrollHeight; });
        await page.waitForTimeout(200);
        await page.locator('img[alt="frame_01999.png"]').waitFor();
        await page.getByTitle('Exit selection mode').click();
        await page.locator('footer button').first().click();
        await page.waitForTimeout(500);
        assert.equal(listRequests, 1, 'media tab switch reuses file listing');
        assert.equal(await page.locator('[data-gallery-index]').count(), 20, 'video cards use the same virtual grid');
        await page.locator('footer button').first().click();
        await page.getByTitle('Folders', { exact: true }).click();
        await page.getByText('album', { exact: true }).click();
        await page.locator('[data-gallery-index="0"]').waitFor();
        assert.ok(await page.locator('[data-gallery-index]').count() < 60, 'folder files are virtualized');
        await page.setViewportSize({ width: 844, height: 390 });
        await page.waitForTimeout(150);
        assert.ok(await page.locator('[data-gallery-index]').count() < 90, 'landscape resize stays bounded');
        await page.getByTitle('Back', { exact: true }).click();
      }
      const back = await measure(() => page.getByTitle('Back', { exact: true }).click());
      await page.getByText('MAIN SCREEN', { exact: true }).waitFor();
      if (!baseline) {
        await page.waitForFunction(() => window.galleryMetrics.canvasBuilds > 0);
        await page.waitForTimeout(300);
        const built = await page.evaluate(() => window.galleryMetrics.canvasBuilds);
        assert.ok(built < 25, 'main generates thumbnails only near the viewport');
        await page.getByText('Reopen gallery', { exact: true }).click();
        await page.locator('img').first().waitFor();
        await page.getByTitle('Back', { exact: true }).click();
        await page.getByText('MAIN SCREEN', { exact: true }).waitFor();
        await page.waitForTimeout(400);
        assert.equal(await page.evaluate(() => window.galleryMetrics.canvasBuilds), built, 'returning to main reuses cached thumbnails');
        await page.getByText('Update first workflow', { exact: true }).click();
        await page.waitForFunction(expected => window.galleryMetrics.canvasBuilds === expected, built + 1);
      }
      assert.deepEqual(errors, []);
      results[baseline ? 'before' : 'after'] = { mounted, enter, selectOne, ws, exit, back };
      console.log(baseline ? 'BEFORE' : 'AFTER', results[baseline ? 'before' : 'after']);
      await context.close();
    }
    fs.writeFileSync('tests/output/gallery-performance-results.json', JSON.stringify(results, null, 2));
    console.log('PASS: real browser, 2,000 files, 4x CPU, bounded DOM, memoization, WS isolation, mouse/touch ranges, reversal, edge scrolling, normal swipe, final row, tab listing reuse, back');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
