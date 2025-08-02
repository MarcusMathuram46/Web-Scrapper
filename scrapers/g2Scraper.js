const fs = require('fs');
const path = require('path');
const { parse } = require('date-fns');
const { isWithinDateRange } = require('../utils/helper');
const { chromium } = require('playwright');

async function g2Scraper(companyName, start, end) {
  const slug = companyName.toLowerCase().replace(/\s+/g, '-');
  const baseUrl = `https://www.g2.com/products/${slug}/reviews`;
  const reviews = [];
  let currentPage = 1;
  let shouldStop = false;

  console.log(`Scraping G2 reviews for ${companyName} using Playwright...`);

  const browser = await chromium.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1366, height: 768 },
    javaScriptEnabled: true,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });

  // Manual stealth
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
    const originalQuery = window.navigator.permissions.query;
    window.navigator.permissions.query = (parameters) =>
      parameters.name === 'notifications'
        ? Promise.resolve({ state: Notification.permission })
        : originalQuery(parameters);
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  });

  const page = await context.newPage();

  try {
    while (!shouldStop) {
      const url = `${baseUrl}?page=${currentPage}`;
      console.log(` Visiting: ${url}`);

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
          break;
        } catch (err) {
          console.warn(` Attempt ${attempt} failed. Retrying...`);
          if (attempt === 3) throw err;
          await page.waitForTimeout(3000);
        }
      }

      await page.mouse.move(100 + Math.random() * 300, 100 + Math.random() * 300);
      await page.waitForTimeout(500 + Math.random() * 300);

      const heading = await page.textContent('h1').catch(() => '');
      if (heading && heading.toLowerCase().includes('page not found')) {
        console.error(`Product "${slug}" not found on G2.`);
        await page.screenshot({ path: `g2_product_not_found_${slug}.png` });
        return [];
      }

      await page.evaluate(async () => {
        const scrollStep = 150;
        const delay = 100;
        for (let y = 0; y <= document.body.scrollHeight; y += scrollStep) {
          window.scrollTo(0, y);
          await new Promise(res => setTimeout(res, delay + Math.random() * 30));
        }
      });

      try {
        await page.waitForFunction(() => {
          return document.querySelectorAll('[data-testid="review-card"]').length > 0;
        }, { timeout: 15000 });
      } catch {
        console.warn(`No reviews found on page ${currentPage}. Stopping.`);
        break;
      }

      const html = await page.content();
      if (
        html.includes('Access blocked') ||
        html.toLowerCase().includes('verify') ||
        html.includes('unusual activity')
      ) {
        console.error('Blocked by G2. Screenshot saved.');
        await page.screenshot({ path: `g2_blocked_page_${currentPage}.png` });
        break;
      }

      const reviewCards = await page.$$('[data-testid="review-card"]');
      for (const card of reviewCards) {
        const title = await card.$eval('[data-testid="review-title"]', el => el.textContent.trim()).catch(() => 'No Title');
        const description = await card.$eval('[data-testid="review-body"]', el => el.textContent.trim()).catch(() => '');
        const reviewer = await card.$eval('[data-testid="consumer-name"]', el => el.textContent.trim()).catch(() => 'Anonymous');
        const rating = await card.$eval('[itemprop="ratingValue"]', el => el.getAttribute('content')).catch(() => '0');
        const rawDate = await card.$eval('[data-testid="review-date"]', el =>
          el.textContent.replace('Reviewed on ', '').trim()
        ).catch(() => '');

        try {
          const parsedDate = parse(rawDate, 'MMMM d, yyyy', new Date());
          const isoDate = parsedDate.toISOString();

          if (isNaN(parsedDate.getTime())) {
            console.warn(`Invalid date format: ${rawDate}`);
            continue;
          }

          if (parsedDate < new Date(start)) {
            shouldStop = true;
            break;
          }

          if (isWithinDateRange(isoDate, start, end)) {
            reviews.push({ title, description, reviewer, rating, date: isoDate });
          }
        } catch (err) {
          console.error(' Date parsing error:', err.message);
        }
      }

      const nextButton = await page.$('li.next:not(.disabled) a');
      if (nextButton && !shouldStop) {
        currentPage++;
        await Promise.all([
          nextButton.click(),
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        ]);
        await page.waitForTimeout(2000 + Math.random() * 2000);
      } else {
        break;
      }
    }
  } catch (error) {
    console.error(`Scraping failed: ${error.message}`);
    await page.screenshot({ path: `g2_error_${currentPage}.png` });
  } finally {
    await browser.close();
  }

  console.log(`Found ${reviews.length} reviews for ${companyName}`);

  const outputDir = path.join(__dirname, '..', 'Output');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${companyName}_g2_reviews.json`);
  fs.writeFileSync(outputPath, JSON.stringify(reviews, null, 2));
  console.log(`Saved ${reviews.length} reviews to ${outputPath}`);

  return reviews;
}

module.exports = g2Scraper;
