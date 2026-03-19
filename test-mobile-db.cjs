const { chromium, devices } = require('playwright');
const iPhone = devices['iPhone 12'];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iPhone
  });
  const page = await context.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') console.log(`[CONSOLE ERROR] ${msg.text()}`);
  });
  page.on('pageerror', exception => {
    console.log(`[UNCAUGHT EXCEPTION] ${exception.message}`);
  });

  console.log('Navigating...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
  await page.evaluate(() => {
      const mockAsset = {
        id: "mock-12345",
        originalDate: new Date().toISOString(),
        uploadDate: new Date().toISOString(),
        status: "PENDING", // <=== THIS TRIGGERS THE 4 PENDING
        title: "Test DB Document",
        imageUrl: "data:image/svg+xml;utf8,<svg></svg>",
        sqlRecord: {
            DOCUMENT_TITLE: "Test DB Document",
            SOURCE_COLLECTION: "MOCK",
            ENTITIES_EXTRACTED: ["test", "db"]
        }
      };
      localStorage.setItem('geograph_assets', JSON.stringify([mockAsset, mockAsset, mockAsset, mockAsset]));
  });
  await page.reload({ waitUntil: 'networkidle' });

  console.log('Dismissing welcome...');
  const skipBtn = page.locator('button', { hasText: 'Skip' }).first();
  if (await skipBtn.count() > 0) await skipBtn.click();
  else await page.keyboard.press('Escape');

  await page.waitForTimeout(2000);
  
  // Try to click database tab via mobile navigation bottom bar or menu
  console.log('Clicking DB Tab...');
  const dbBtn = page.locator('text="Database"');
  if (await dbBtn.count() > 0) {
      await dbBtn.first().click();
  } else {
      console.log('DB tab not found! Looking for menu...');
  }

  await page.waitForTimeout(2000);

  // Check if we hit the ErrorBoundary
  const btnRestart = page.locator('text="Restart Application"');
  if (await btnRestart.count() > 0 && await btnRestart.isVisible()) {
      console.log('Found "Restart Application" button! Error boundary triggered.');
      const errTexts = await page.locator('.text-red-400, .text-red-500').allTextContents();
      console.log('Error texts:', errTexts);
  } else {
      console.log('No error boundary visible.');
  }

  const allText = await page.locator('body').innerText();
  console.log('Body text snippet:', allText.substring(0, 200).replace(/\n/g, ' '));
  
  await browser.close();
  process.exit(0);
})();
