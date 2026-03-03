const { chromium } = require('playwright');

async function testHeadless() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const issues = [];

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      issues.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', exception => {
    issues.push(`[UNCAUGHT EXCEPTION] ${exception.message}`);
  });

  page.on('requestfailed', request => {
    issues.push(`[FAILED REQUEST] ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
  });

  console.log('Navigating to http://localhost:3000...');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded successfully.');
    
    // Attempt some interactions, or just wait for map/dashboard to load
    await page.waitForTimeout(5000);
  } catch (err) {
    issues.push(`[NAVIGATION ERROR] ${err.message}`);
  }

  console.log('\n--- Friction Areas Found (Console Errors, Warnings, and Exceptions) ---');
  if (issues.length === 0) {
    console.log('No issues detected! The app loaded cleanly in headless mode.');
  } else {
    issues.forEach(issue => console.log(issue));
  }

  await browser.close();
  console.log('\nTesting complete.');
}

testHeadless().catch(console.error);
