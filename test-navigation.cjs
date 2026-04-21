const { chromium } = require('playwright');
async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('framenavigated', frame => console.log('NAVIGATED:', frame.url()));
  page.on('requestfailed', req => console.log('FAILED:', req.url(), req.failure()?.errorText));
  page.on('console', msg => console.log('CONSOLE:', msg.text()));
  await page.goto('http://localhost:3000', { waitUntil: 'load' });
  await browser.close();
}
run();
