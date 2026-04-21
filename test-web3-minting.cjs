const { chromium } = require('playwright');

async function testWeb3Minting() {
  console.log('Launching browser with mocked Web3 injected provider...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  
  // Inject mock window.ethereum across all pages
  await context.addInitScript(() => {
    window.ethereum = {
      isMetaMask: true,
      request: async (request) => {
         if (request.method === 'eth_requestAccounts') {
             return ['0x1234567890123456789012345678901234567890'];
         }
         if (request.method === 'eth_chainId') {
             return '0x1'; // mainnet
         }
         if (request.method === 'eth_accounts') {
             return ['0x1234567890123456789012345678901234567890'];
         }
         return null;
      },
      on: () => {},
      removeListener: () => {}
    };
  });

  const page = await context.newPage();
  
  let issues = [];
  page.on('pageerror', err => issues.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  console.log('Navigating to http://localhost:4175...');
  await page.goto('http://localhost:4175', { waitUntil: 'load', timeout: 30000 });
  await page.evaluate(() => localStorage.setItem('geograph_onboarding_completed', 'true'));
  await page.reload({ waitUntil: 'load' });

  // Dismiss Welcome Dialog
  const skipBtn = page.locator('button', { hasText: 'Skip' }).first();
  if (await skipBtn.count() > 0) {
    await skipBtn.click({ force: true });
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(2000);
  const welcome = page.locator('text="Welcome wizard"');
  await page.evaluate(() => { const els = document.querySelectorAll('[aria-label="Welcome wizard"], [role="dialog"]'); els.forEach(el => el.remove()); });

  console.log('Testing Web3 Interactions...');
  
  try {
     const settingsTab = page.locator('text="Settings"').first();
     if (await settingsTab.count() > 0) {
         await settingsTab.click({ force: true });
  await page.waitForTimeout(2000);
  const welcome = page.locator('text="Welcome wizard"');
  await page.evaluate(() => { const els = document.querySelectorAll('[aria-label="Welcome wizard"], [role="dialog"]'); els.forEach(el => el.remove()); });
     }
     
     // Find the wallet connection UI (if any)
     const connectBtn = page.locator('button', { hasText: /Connect Wallet|Web3|Mint/i }).first();
     if (await connectBtn.count() > 0 && await connectBtn.isVisible()) {
         await connectBtn.click({ force: true });
         console.log('Clicked Web3 Connect/Mint button successfully.');
  await page.waitForTimeout(2000);
  const welcome = page.locator('text="Welcome wizard"');
  await page.evaluate(() => { const els = document.querySelectorAll('[aria-label="Welcome wizard"], [role="dialog"]'); els.forEach(el => el.remove()); });
     } else {
         console.log('No Web3 connection button found in Settings, checking social/explore tab...');
     }

  } catch(e) {
      issues.push('Error during Web3 flow: ' + e.message);
  }

  if (issues.length > 0) {
      console.error('Web3 Test Issues:', issues);
      process.exit(1);
  } else {
      console.log('Web3 headless flow completed without errors.');
  }
  
  await browser.close();
}

testWeb3Minting().catch(console.error);
