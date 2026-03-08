const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const filePath = path.resolve(__dirname, 'upload.html');
  await page.goto(`file:///${filePath.replace(/\\/g, '/')}`);
  await new Promise(r => setTimeout(r, 500));
  // Full page screenshot to capture scroll
  await page.screenshot({ path: path.resolve(__dirname, 'upload-screenshot.png'), fullPage: true });
  console.log('Screenshot saved.');
  await browser.close();
})();
