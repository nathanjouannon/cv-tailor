// Export PDF via Puppeteer (Chromium téléchargé par npm install). Voir docs/05-templates.md.
import puppeteer from 'puppeteer';
import { PDFDocument } from 'pdf-lib';

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({ headless: true, args: ['--no-sandbox', '--font-render-hinting=none'] })
      .catch((e) => { browserPromise = null; throw e; });
    const b = await browserPromise;
    b.on('disconnected', () => { browserPromise = null; });
  }
  return browserPromise;
}

export async function chromiumStatus() {
  try {
    const p = puppeteer.executablePath();
    const fs = await import('node:fs');
    return { present: fs.existsSync(p), chemin: p };
  } catch (e) { return { present: false, chemin: null, erreur: e.message }; }
}

/** @param {string} document  HTML complet (voir render.fullDocument) @returns {Promise<Buffer>} */
export async function renderPdf(document) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(document, { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');
    return await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true, margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  } finally {
    await page.close().catch(() => {});
  }
}

/** Capture PNG de la page A4 (utilisée pour comparer un template généré au PDF d'origine). */
export async function renderPng(document) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1.5 });
    await page.setContent(document, { waitUntil: 'load' });
    await page.evaluateHandle('document.fonts.ready');
    return await page.screenshot({ type: 'png', fullPage: true });
  } finally {
    await page.close().catch(() => {});
  }
}

/** Nombre de pages d'un PDF. */
export async function pdfPageCount(buf) {
  return (await PDFDocument.load(buf)).getPageCount();
}

export async function closeBrowser() {
  if (browserPromise) { const b = await browserPromise.catch(() => null); browserPromise = null; if (b) await b.close().catch(() => {}); }
}
