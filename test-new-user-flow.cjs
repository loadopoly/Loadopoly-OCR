const { chromium } = require('playwright');

async function testNewUserFlow() {
  console.log('Testing NEW USER FLOW: Landing -> App Shell -> Features');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ permissions: ['camera', 'geolocation'] });
  const page = await context.newPage();
  
  const issues = [];
  page.on('pageerror', err => issues.push(`[PAGE ERROR] ${err.message}`));

  try {
    const URL = 'http://localhost:4173';
    console.log(`Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 });
    
    console.log('Step 1: Landing page render...');
    await page.waitForSelector('button:has-text("Try Free")', { timeout: 15000 });
    await page.click('button:has-text("Try Free")');
    
    console.log('Step 2: Onboarding Wizard (skip to end)...');
    try {
      await page.waitForSelector('text=Next', { timeout: 5000 });
      if (await page.locator('button:has-text("Skip")').count() > 0) {
        await page.click('button:has-text("Skip")');
        console.log('Clicked Skip button');
      } else {
        let hasNext = await page.locator('button:has-text("Next")').count() > 0;
        while(hasNext) {
          await page.click('button:has-text("Next")');
          await page.waitForTimeout(500);
          hasNext = await page.locator('button:has-text("Next")').count() > 0;
        }
        if (await page.locator('button:has-text("Get Started")').count() > 0) {
          await page.click('button:has-text("Get Started")');
        }
      }
    } catch(err) {
      console.log('Wizard skip logic error: ' + err.message);
    }
    
    // Give it a moment to transition
    await page.waitForTimeout(2000);

    // If wizard is still intercepting, try a generic escape mechanism, e.g. clicking coordinates outside
    const isWizardVisible = await page.locator('div[role="dialog"][aria-label*="Welcome"]').isVisible().catch(()=>false);
    if (isWizardVisible) {
      console.log('Wizard still visible, attempting to force close...');
      await page.keyboard.press('Escape');
    }
    
    await page.waitForSelector('text=Total Assets', { timeout: 10000 });
    console.log('App shell loaded to empty Dashboard! ✔');
    
    console.log('Step 3: Navigating to Settings...');
    await page.click('button:has-text("Settings")');
    await page.waitForSelector('text=Gemini', { timeout: 5000 });
    console.log('Settings view active ✔');

    console.log('Step 4: Checking tabs without data...');
    const tabs = ['Quick Processing', 'Assets & Bundles', 'Knowledge Graph', 'Structured DB'];
    for (const tab of tabs) {
      await page.click(`button:has-text("${tab}")`);
      await page.waitForTimeout(1000);
      console.log(`Tab '${tab}' rendered without crashing ✔`);
    }

    console.log('\n✅ New user flow testing completed without throwing unexpected fatal errors.');
  } catch(e) {
    console.error('\n❌ Fatal flow error:', e);
    issues.push(`[FATAL] ${e.message}`);
  }

  if (issues.length > 0) {
    console.log('\n--- Found Issues ---');
    issues.forEach(i => console.log(i));
    process.exitCode = 1;
  }
  
  await browser.close();
  process.exit();
}

testNewUserFlow().catch(console.error);
