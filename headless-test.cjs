const { chromium } = require('playwright');
const { exec } = require('child_process');

async function testHeadless() {
  console.log('Starting local dev server...');
  const server = exec('npm run dev');
  
  // wait a bit for server to start
  await new Promise(r => setTimeout(r, 5000));

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
    issues.push(`[FAILED REQUEST] ${request.url()} - ${request.failure().errorText}`);
  });

  console.log('Navigating to http://localhost:5173...');
  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle', timeout: 15000 });
    console.log('Page loaded successfully.');
    
    // Wait an additional few seconds to let any async setup happen
    await page.waitForTimeout(3000);
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
  server.kill();
  console.log('\nTesting complete.');
}

testHeadless().catch(console.error);
