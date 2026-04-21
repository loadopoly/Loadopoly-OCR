const { chromium } = require('playwright');

async function testStructuredDBInteractive() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const issues = [];

  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('favicon')) {
      issues.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
      console.log(`[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', exception => {
    issues.push(`[UNCAUGHT EXCEPTION] ${exception.message}`);
    console.log(`[EXCEPTION] ${exception.message}`);
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  console.log('Navigating to http://localhost:4175...');
  try {
    await page.goto('http://localhost:4175', { waitUntil: 'load', timeout: 30000 });
    
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
    });
    
    await page.reload({ waitUntil: 'load' });

    console.log('Testing Onboarding / Welcome Flow...');
    // Dismiss Welcome Dialog
    const skipBtn = page.locator('button', { hasText: 'Skip' }).first();
    if (await skipBtn.count() > 0) {
      await skipBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }

  await page.waitForTimeout(2000);
  const welcome = page.locator('text="Welcome wizard"');
  await page.evaluate(() => { const els = document.querySelectorAll('[aria-label="Welcome wizard"], [role="dialog"]'); els.forEach(el => el.remove()); });

    const tabsToTest = ['Structured DB', 'Explore', 'Settings', 'Quick Processing', 'Social Hub'];

    for (const tab of tabsToTest) {
      try {
        console.log(`\nTesting: ${tab}`);
        const tabLoc = page.locator(`text="${tab}"`).first();
        if (await tabLoc.count() > 0) {
          await tabLoc.click({ timeout: 5000 }).catch(e => console.log('Click skipped: ' + tab));
          await page.waitForTimeout(2000);
          
          if (tab === 'Settings') {
             console.log('  Testing Settings Interactivity...');
             // Click the Sign In / Connect button to trigger AuthModal or simulate profile action
             const btnSignIn = page.locator('button', { hasText: /Sign In|Connect/i }).first();
             if (await btnSignIn.count() > 0) {
               await btnSignIn.click();
               await page.waitForTimeout(500);
               const emailInput = page.locator('input[type="email"]').first();
               if (await emailInput.count() > 0) {
                 await emailInput.fill('test@example.com');
                 await page.keyboard.press('Escape'); // close modal
               }
             }

             // Test Privacy Policy Toggle / Modal
             const btnPrivacy = page.locator('button, a', { hasText: /Privacy/i }).first();
             if (await btnPrivacy.count() > 0 && await btnPrivacy.isVisible()) {
               await btnPrivacy.click();
               await page.waitForTimeout(500);
               await page.keyboard.press('Escape');
             }
          }

          // Let's check if the generic 'encountered an error' fallback is visible
          const errorUI = page.locator('text="encountered an error"').first();
          if (await errorUI.count() > 0 && await errorUI.isVisible()) {
             issues.push(`[ERROR CATCHED BY UI in ${tab}] "encountered an error" was displayed.`);
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
  
  if (issues.length > 0) process.exit(1);
}

testStructuredDBInteractive().catch(console.error);
