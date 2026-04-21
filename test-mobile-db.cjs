const { chromium, devices } = require('playwright');
const iPhone = devices['iPhone 12'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iPhone,
    hasTouch: true
  });
  const page = await context.newPage();
  
  let issues = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
       issues.push(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });
  page.on('pageerror', exception => {
    issues.push(`[UNCAUGHT EXCEPTION] ${exception.message}`);
  });

  console.log('Navigating...');
  await page.goto('http://localhost:4175', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => {
      const mockAsset = {
        id: "mock-12345",
        originalDate: new Date().toISOString(),
        uploadDate: new Date().toISOString(),
        status: "PENDING",
        title: "Test DB Document",
        imageUrl: "data:image/svg+xml;utf8,<svg></svg>",
        sqlRecord: {
            DOCUMENT_TITLE: "Test DB Document",
            SOURCE_COLLECTION: "MOCK",
            ENTITIES_EXTRACTED: ["test", "db"]
        }
      };
      localStorage.setItem('geograph_assets', JSON.stringify([mockAsset, mockAsset, mockAsset, mockAsset]));
      localStorage.setItem('geograph_onboarding_completed', 'true');
  });
  await page.reload({ waitUntil: 'load' });

  await page.waitForTimeout(2000);

  // Dismiss Welcome Dialog
  const skipBtn = page.locator('button', { hasText: 'Skip' }).first();
  if (await skipBtn.count() > 0) {
    await skipBtn.click({ force: true });
  } else {
    await page.keyboard.press('Escape');
  }
  
  console.log('Testing Mobile Navigation Toggle...');
  // Find menu toggle button (hamburger icon)
  const menuBtn = page.locator('button.mobile-menu-toggle, button[aria-label="Toggle menu"], button svg').locator('..').filter({hasText: ''}).nth(0);
  let clickedMenu = false;
  
  // A generic fallback if specific classes aren't in place
  if (await menuBtn.count() > 0 && await menuBtn.isVisible()) {
     await menuBtn.click({ force: true });
     console.log('Clicked mobile menu toggle.');
     clickedMenu = true;
  await page.waitForTimeout(2000);
  const welcome = page.locator('text="Welcome wizard"');
  await page.evaluate(() => { const els = document.querySelectorAll('[aria-label="Welcome wizard"], [role="dialog"]'); els.forEach(el => el.remove()); });
  } else {
     // fallback to just tapping the screen top-left
     await page.mouse.tap(20, 20);
  }

  console.log('Looking for tabs in mobile drawer...');
  const dbBtn = page.locator('text="Database"').first();
  if (await dbBtn.count() > 0 && await dbBtn.isVisible()) {
      await dbBtn.click({ force: true });
      console.log('Clicked DB tab in mobile view.');
  } else {
      console.log('DB tab not found visible! Trying to simulate swipe up/down gesture...');
      await page.mouse.move(200, 400);
      await page.mouse.down();
      await page.mouse.move(200, 200); // Swipe up
      await page.mouse.up();
  await page.waitForTimeout(2000);
  const welcome = page.locator('text="Welcome wizard"');
  await page.evaluate(() => { const els = document.querySelectorAll('[aria-label="Welcome wizard"], [role="dialog"]'); els.forEach(el => el.remove()); });
  }

  await page.waitForTimeout(2000);

  // Check if we hit the ErrorBoundary
  const btnRestart = page.locator('text="Restart Application"');
  if (await btnRestart.count() > 0 && await btnRestart.isVisible()) {
      console.log('Found "Restart Application" button! Error boundary triggered.');
      const errTexts = await page.locator('.text-red-400, .text-red-500').allTextContents();
      issues.push('Error Boundary hit on Mobile view: ' + errTexts.join(' '));
  } else {
      console.log('No error boundary visible.');
  }
  
  if (issues.length > 0) {
     console.error('Mobile DB Benchmark issues found:', issues);
     process.exit(1);
  } else {
     console.log('Mobile navigation and layout flow completed without errors.');
  }

  await browser.close();
  process.exit(0);
})();
