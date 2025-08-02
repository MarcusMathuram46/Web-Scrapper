const minimist = require('minimist');
const fs = require('fs');
const path = require('path');
const { parse } = require('date-fns');
const { filterByDate, saveToFile } = require('./utils/helper');

const g2Scraper = require('./scrapers/g2Scraper');
const capterraScraper = require('./scrapers/capterraScraper');


const args = minimist(process.argv.slice(2));
const { company, start, end, source } = args;

const isValidDate = (d) => !isNaN(new Date(d).getTime());

if (!company || !start || !end || !source || !isValidDate(start) || !isValidDate(end)) {
  console.error("Usage: node index.js --company <company_name> --start <YYYY-MM-DD> --end <YYYY-MM-DD> --source <g2|capterra|");
  process.exit(1);
}

(async () => {
  console.log(`Scraping ${source} reviews for ${company} from ${start} to ${end}...`);
  
  let reviews = [];
  try {
    switch (source.toLowerCase()) {
      case 'g2':
        reviews = await g2Scraper(company, start, end);
        break;
      case 'capterra':
        reviews = await capterraScraper(company, start, end);
        break;
      default:
        console.error("Invalid source. Use g2, capterra.");
        process.exit(1);
    }
  } catch (error) {
    console.error('Scraping failed:', error.message);
    process.exit(1);
  }

  // Additional date validation
  reviews = reviews.map((r) => {
    const parsed = new Date(r.date);
    return isNaN(parsed) ? null : { ...r, date: parsed.toISOString() };
  }).filter(Boolean);

  console.log("\nPreview of extracted review dates:");
  reviews.slice(0, 5).forEach((r, i) => {
    console.log(`#${i + 1}: ${r.date}, valid=${!isNaN(new Date(r.date))}`);
  });

  const filtered = filterByDate(reviews, start, end);
  
  const outputFile = `./Output/${company}_${source}_reviews.json`;
  saveToFile(filtered, outputFile);
})();