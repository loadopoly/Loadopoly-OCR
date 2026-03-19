const { chromium } = require('playwright');

async function testStructuredDBInteractive() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const issues = [];

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      issues.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      console.log(`[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', exception => {
    issues.push(`[UNCAUGHT EXCEPTION] ${exception.message}`);
    console.log(`[EXCEPTION] ${exception.message}`);
  });

  console.log('Navigating to http://localhost:3000...');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    
    // Inject mock local assets so Structured DB is NOT empty
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
      localStorage.setItem('geograph_assets', JSON.stringify([mockAsset]));
      // Need to reload to pick up localstorage
    });
    
    await page.reload({ waitUntil: 'networkidle' });

    // Dissmiss Welcome Dialog
    const skipBtn = page.locator('button', { hasText: 'Skip' }).first();
    if (await skipBtn.count() > 0) {
      await skipBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

    await page.waitForTimeout(1000);

    const tabsToTest = ['Structured DB', 'Explore', 'Settings', 'Quick Processing', 'Social Hub'];

    for (const tab of tabsToTest) {
      try {
        console.log(`\nTesting: ${tab}`);
        const tabLoc = page.locator(`text="${tab}"`).first();
        if (await tabLoc.count() > 0) {
          await tabLoc.click({ timeout: 5000 }).catch(e => console.log('Click skipped: ' + tab));
          await page.waitForTimeout(2000);
          
          // Let's check if the generic 'encountered an error' fallback is visible
          const errorUI = page.locator('text="encountered an error"').first();
          if (await errorUI.count() > 0 && await errorUI.isVisible()) {
             issues.push(`[ERROR CATCHED BY UI in ${tab}] "encountered an error" was displayed.`);
          }

          const btnError = page.locator('text="Error"');
          if (await btnError.count() > 0 && await btnError.isVisible()) {
              issues.push(`[ERROR CATCHED BY UI in ${tab}] Error rendered.`);
          }
        }
      } catch (err) {
        issues.push(`[${tab} TAB ERROR] ${err.message}`);
      }
    }
    
  } catch (err) {
    issues.push(`[TEST ERROR] ${err.message}`);
  }

  console.log('\n--- Friction Areas Found in Structured DB Interactions ---');
  if (issues.length === 0) {
    console.log('No issues detected!');
  } else {
    issues.forEach(issue => console.log(issue));
  }

  await browser.close();
}

testStructuredDBInteractive().catch(console.error);
