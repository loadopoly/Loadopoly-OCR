const { chromium } = require('playwright');

async function testStructuredDB() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const issues = [];
  const requests = new Map();

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

  page.on('requestfailed', request => {
    if (request.url().includes('localhost') || request.url().includes('supabase')) {
      issues.push(`[FAILED REQUEST] ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
      console.log(`[FAILED] ${request.url()}`);
    }
  });

  console.log('Navigating to http://localhost:3000...');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'load', timeout: 30000 });
    console.log('Page loaded successfully.');
    
    // Wait a bit to let initial rendering settle
    await page.waitForTimeout(3000);

    // Try dismissing the Welcome to GeoGraph dialog
    const skipBtn = page.locator('button', { hasText: 'Skip' }).first();
    if (await skipBtn.count() > 0) {
      await skipBtn.click();
      console.log('Clicked Skip in welcome dialog.');
      await page.waitForTimeout(1000);
    } else {
      await page.keyboard.press('Escape');
    }

    console.log('Attempting to click "Structured DB" tab...');
    // Locate the "Structured DB" button/tab
    // We can also try pressing the '6' key as a fallback
    const dbTab = page.locator('text="Structured DB"').first();
    if (await dbTab.count() > 0) {
      await dbTab.click();
      console.log('Clicked "Structured DB" tab.');
    } else {
      console.log('Tab not found, pressing "6" key...');
      await page.keyboard.press('6');
    }

    console.log('Waiting for Structured DB to load and operate (10 seconds)...');
    await page.waitForTimeout(10000);
    
  } catch (err) {
    issues.push(`[NAVIGATION/EXECUTION ERROR] ${err.message}`);
  }

  console.log('\n--- Friction Areas Found in Structured DB ---');
  if (issues.length === 0) {
    console.log('No issues detected!');
  } else {
    issues.forEach(issue => console.log(issue));
  }

  // Also check if any prominent error messages are visible on screen
  try {
    const errorToasts = await page.locator('.toast-error, [role="alert"]').allTextContents();
    if (errorToasts.length > 0) {
      console.log('\nVisible Error UI Elements:');
      errorToasts.forEach(t => console.log(`- ${t}`));
    }
  } catch (e) {
    // Ignore if locator fails
  }

  await browser.close();
  console.log('\nTesting complete.');
}

testStructuredDB().catch(console.error);
