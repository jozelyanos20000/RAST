const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  const filePath = path.resolve(__dirname, 'index.html');
  await page.goto(`file:///${filePath.replace(/\\/g, '/')}`);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.resolve(__dirname, 'screenshot.png'), fullPage: false });
  console.log('Screenshot saved to prototype/screenshot.png');
  await browser.close();
})();
