// Run with Node. Uses installed Playwright, or the desktop app's bundled copy.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can point to other local installations.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL('..', import.meta.url));
let playwright;
try {
  playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
} catch (error) {
  const bundled = '/Applications/ChatGPT.app/Contents/Resources/cua_node/lib/node_modules/playwright';
  if (process.env.PLAYWRIGHT_MODULE || !existsSync(bundled)) throw error;
  playwright = require(bundled);
}
const localChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const executablePath = process.env.CHROMIUM_PATH || (existsSync(localChrome) ? localChrome : undefined);
const stylesheet = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const cases = [
  ...[320, 360, 375, 390, 414, 430, 540, 768].map(width => ({ viewport: width, panel: width })),
  ...[769, 820, 1023].map(width => ({ viewport: width, panel: 420 })),
  ...[1024, 1069, 1280, 1440, 1920].map(width => ({ viewport: width, panel: 520 })),
  { viewport: 1440, panel: 448 },
  { viewport: 1440, panel: 600 },
  { viewport: 1600, panel: 900 },
  ...[380, 381, 450, 451, 699, 700].map(width => ({ viewport: 1600, panel: width + 64 }))
];
let viteServer;
let browser;

try {
  viteServer = await createServer({
    appType: 'custom', configFile: false, logLevel: 'silent', root: projectRoot,
    server: { middlewareMode: true }
  });
  const { default: TripHomeActions } = await viteServer.ssrLoadModule('/src/TripHomeActions.jsx');
  browser = await playwright.chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage();
  // Keep the layout check offline; use the page's system-font fallback.
  await page.route('**/*', route => route.fulfill({ contentType: 'text/css', body: '' }));
  let checked = 0;
  const failures = [];

  for (const signedIn of [true, false]) {
    const actions = renderToStaticMarkup(React.createElement(TripHomeActions, {
      session: signedIn ? { user: { id: 'layout-fixture' } } : null
    }));
    for (const { viewport, panel } of cases) {
      await page.setViewportSize({ width: viewport, height: 900 });
      await page.setContent(`<div style="width:${panel}px">
        <div class="sidebar-header" style="padding:14px 32px;background:white">
          <div class="sidebar-brand-auth-row sidebar-brand-auth-row--with-actions">
            <div class="sidebar-brand-copy">
              <h1 style="font-size:24px;font-weight:900;color:#111827;margin:0;letter-spacing:-0.05em">TripPlot</h1>
              <p style="font-size:9px;font-weight:800;color:#2563eb;letter-spacing:0.15em;margin:2px 0 0">여행 일정 플래너</p>
            </div>${actions}
          </div>
        </div></div>`);
      await page.addStyleTag({ content: stylesheet });
      const geometry = await page.evaluate(() => {
        const rect = node => {
          const { x, y, width, height, right } = node.getBoundingClientRect();
          return { x, y, width, height, right };
        };
        const row = document.querySelector('.sidebar-brand-auth-row');
        return {
          row: rect(row), brand: rect(row.querySelector('.sidebar-brand-copy')),
          buttons: [...row.querySelectorAll('button')].map(button => {
            const label = button.querySelector('.trip-home-action-label-compact');
            const range = document.createRange();
            range.selectNodeContents(label);
            const icon = button.querySelector('svg');
            const iconVisible = getComputedStyle(icon).display !== 'none';
            return {
              text: label.textContent, ...rect(button), label: rect(label),
              textLines: [...new Set([...range.getClientRects()].map(line => Math.round(line.y)))].length,
              icon: iconVisible ? rect(icon) : null,
              clientWidth: button.clientWidth, scrollWidth: button.scrollWidth
            };
          })
        };
      });
      const name = `${signedIn ? 'logout' : 'login'} viewport=${viewport} panel=${panel}`;
      try {
        assert.equal(geometry.buttons.length, 4, name);
        for (const [index, button] of geometry.buttons.entries()) {
          assert.equal(button.textLines, 1, `${name}: ${button.text} wraps`);
          assert.ok(button.label.x >= button.x && button.label.right <= button.right + 1, `${name}: ${button.text} label is clipped`);
          assert.ok(button.scrollWidth <= button.clientWidth + 1, `${name}: ${button.text} content overflows`);
          assert.ok(button.x >= geometry.brand.right && button.right <= geometry.row.right + 1, `${name}: action overlaps brand or header edge`);
          assert.ok(Math.abs(button.y - geometry.buttons[0].y) < 1, `${name}: actions are not in one row`);
          assert.ok(Math.abs(button.width - geometry.buttons[0].width) < 1, `${name}: action widths differ`);
          if (button.icon) assert.ok(button.icon.right <= button.label.x + 1, `${name}: icon overlaps label`);
          if (index) assert.ok(geometry.buttons[index - 1].right <= button.x, `${name}: buttons overlap`);
        }
        checked++;
      } catch (error) {
        failures.push(error.message);
      }
    }
  }
  assert.deepEqual(failures, [], `Header layout failures:\n${failures.join('\n')}`);
  console.log(`PASS: ${checked} signed-in/guest header layouts keep four equal-width actions on one line without clipping or overlap.`);
} finally {
  await browser?.close();
  await viteServer?.close();
}
