const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto('file://' + process.cwd() + '/welcome.html');
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: 'screenshot_current.png', fullPage: true });
  await browser.close();
  console.log("Screenshot saved!");
})();
