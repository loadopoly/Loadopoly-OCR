const { chromium } = require('playwright');

async function testHeadless() {
  console.log('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  const issues = [];
  const requests = new Map();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      issues.push(`[${msg.type().toUpperCase()}] ${msg.text()}`);
    }
  });

  page.on('pageerror', exception => {
    issues.push(`[UNCAUGHT EXCEPTION] ${exception.message}`);
  });

  page.on('request', req => {
    if (req.url().includes('supabase')) {
      requests.set(req.url(), 'pending');
      console.log(`[REQ] ${req.method()} ${req.url()}`);
    }
  });

  page.on('requestfinished', async req => {
    if (req.url().includes('supabase')) {
      requests.set(req.url(), 'finished');
      const res = await req.response();
      console.log(`[RES] ${req.url()} - ${res ? res.status() : 'null'}`);
    }
  });

  page.on('requestfailed', request => {
    if (request.url().includes('supabase')) {
      requests.set(request.url(), 'failed');
      issues.push(`[FAILED REQUEST] ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
      console.log(`[FAILED] ${request.url()} - ${request.failure()?.errorText || 'Unknown error'}`);
    }
  });

  console.log('Navigating to http://localhost:3000...');
  try {
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle', timeout: 30000 });
    console.log('Page loaded successfully.');
    
    // Wait a long time to see if the requests resolve!
    console.log('Waiting 10s for any background requests to finish naturally...');
    await page.waitForTimeout(10000);
    
    console.log('\n--- Map of Supabase requests ---');
    requests.forEach((status, url) => {
      console.log(`${status.toUpperCase()}: ${url}`);
    });
    
  } catch (err) {
    issues.push(`[NAVIGATION ERROR] ${err.message}`);
  }

  console.log('\n--- Friction Areas Found ---');
  if (issues.length === 0) {
    console.log('No issues detected!');
  } else {
    issues.forEach(issue => console.log(issue));
  }

  await browser.close();
  console.log('\nTesting complete.');
}

testHeadless().catch(console.error);
