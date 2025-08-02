const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

async function capterraScraper(company) {
  const searchUrl = `https://www.capterra.com/search/?query=${encodeURIComponent(
    company,
  )}`;
  const reviews = [];

  const browser = await puppeteer.launch({
    headless: "new", // Use 'new' mode for better performance
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  try {
    console.log(`Searching for: ${company}`);
    await page.goto(searchUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    const content = await page.content();

    // Check if CAPTCHA or blocked page
    if (
      content.includes('captcha') ||
      content.includes('Are you a human') ||
      content.includes('Access Denied')
    ) {
      throw new Error('CAPTCHA or Access Blocked by Capterra.');
    }

    // Try different selectors (more robust)
    await page.waitForSelector('a[href*="/p/"]', { timeout: 30000 });

    const productUrl = await page.evaluate(() => {
      const link = document.querySelector('a[href*="/p/"]');
      return link?.href || null;
    });

    if (!productUrl) throw new Error('No product link found for company');

    const reviewsPageUrl = productUrl.replace(/\/$/, '') + '/reviews';
    console.log(`Navigating to reviews page: ${reviewsPageUrl}`);
    await page.goto(reviewsPageUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    await page.waitForSelector('.e1xzmg0z.c1ofrhif', {
      timeout: 10000,
    });
    await autoScroll(page);

    // Scroll to load reviews
    await autoScroll(page);

    const scraped = await page.evaluate(() => {
      const reviews = [];
      const cards = document.querySelectorAll('div[class*="e1xzmg0z"]');

      for (const card of cards) {
        const rawDate =
          card.querySelector('.typo-0')?.innerText.trim() || 'Unknown';
        const title = card.querySelector('.typo-20')?.innerText.trim() || '';
        const content = card.querySelector('p')?.innerText.trim() || '';
        const rating =
          card
            .querySelector('div[data-testid="rating"] > span:last-of-type')
            ?.innerText.trim() || null;

        const reviewer =
          card.querySelector('span.typo-20')?.innerText.trim() || 'Anonymous';

        reviews.push({
          date: rawDate,
          title,
          review: content,
          rating,
          reviewer,
          source: 'Capterra',
        });
      }

      return reviews;
    });

    console.log(`Extracted ${scraped.length} reviews.`);
    reviews.push(...scraped);

    await browser.close();
    return reviews;
  } catch (err) {
    console.error(' Capterra scraping error:', err.message);
    await browser.close();
    return [];
  }
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

module.exports = capterraScraper;
