const fs = require('fs');
const path = require('path');

function filterByDate(reviews, start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return reviews.filter(r => {
    const reviewDate = new Date(r.date);
    return reviewDate >= startDate && reviewDate <= endDate;
  });
}

function saveToFile(data, filepath) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`✅ Saved ${data.length} reviews to ${filepath}`);
}

function isWithinDateRange(dateStr, startStr, endStr) {
  const reviewDate = new Date(dateStr);
  const startDate = new Date(startStr);
  const endDate = new Date(endStr);
  return reviewDate >= startDate && reviewDate <= endDate;
}

module.exports = { filterByDate, saveToFile, isWithinDateRange };