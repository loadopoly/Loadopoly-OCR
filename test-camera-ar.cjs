const { chromium } = require('playwright');

async function testCameraAndAR() {
  console.log('Launching browser with mocked camera...');
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream'
    ]
  });
  
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ['camera', 'microphone']
  });
  const page = await context.newPage();
  
  let issues = [];
  page.on('pageerror', err => issues.push(err.message));

  console.log('Navigating to http://localhost:4175...');
  await page.setViewportSize({ width: 1440, height: 900 });
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
  await page.evaluate(() => { const els = document.querySelectorAll('[aria-label="Welcome wizard"], [role="dialog"]'); els.forEach(el => el.remove()); });

  console.log('Testing Scene Selection & Camera Mocks...');
  
  try {
     const captureTab = page.locator('text="Quick Processing"').first();
     if (await captureTab.count() > 0) {
         await captureTab.click({ force: true });
     }

     await page.waitForTimeout(2000);
     await page.evaluate(() => { const els = document.querySelectorAll('[aria-label="Welcome wizard"], [role="dialog"]'); els.forEach(el => el.remove()); });
     
     // Check if we are in the blocked global view and switch to local
     const btnLocal = page.locator('button', { hasText: 'Switch to Local' }).first();
     if (await btnLocal.count() > 0 && await btnLocal.isVisible()) {
         await btnLocal.click({ force: true });
         await page.waitForTimeout(1000);
     }

     // Mock selecting an item to trigger the camera mode
     const btnScan = page.locator('button', { hasText: 'Scanned Documents' }).first();
     if (await btnScan.count() > 0 && await btnScan.isVisible()) {
         await btnScan.click({ force: true });
         await page.waitForTimeout(2000);
         
         const videoElement = page.locator('video').first();
         if (await videoElement.count() > 0) {
             console.log('Camera video element rendered successfully!');
         } else {
             issues.push('Camera video element NOT rendered.');
         }
         
         const btnCapture = page.locator('button', { hasText: /Capture|Take Photo/i }).first();
         if (await btnCapture.count() > 0) {
            await btnCapture.click({ force: true });
            console.log('Simulated capture click.');
         }
     } else {
         issues.push('Could not find a Scanned Documents button.');
     }

  } catch(e) {
      issues.push('Error during Camera/AR flow: ' + e.message);
  }

  if (issues.length > 0) {
      console.error('Camera/AR Test Issues:', issues);
      process.exit(1);
  } else {
      console.log('Camera & AR headless flow completed without errors.');
  }
  
  await browser.close();
}

testCameraAndAR().catch(console.error);
