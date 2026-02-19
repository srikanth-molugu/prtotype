const path = require('path');
const fs = require('fs/promises');
const ejs = require('ejs');
const puppeteer = require('puppeteer');

async function renderCertificateHtml(templateName, data) {
  const templatePath = path.join(__dirname, '..', 'templates', `${templateName}.ejs`);
  const templateContent = await fs.readFile(templatePath, 'utf8');
  return ejs.render(templateContent, data);
}

async function htmlToPdfBuffer(html) {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });
  const pdf = await page.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: {
      top: '12mm',
      right: '12mm',
      bottom: '12mm',
      left: '12mm'
    }
  });
  await browser.close();
  return pdf;
}

module.exports = { renderCertificateHtml, htmlToPdfBuffer };
