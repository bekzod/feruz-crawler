import { parseHtml } from "./dom.js";

let browserPromise = null;

async function getBrowser() {
  if (!browserPromise) {
    browserPromise = (async () => {
      // cloakbrowser exports launch() directly — it wraps playwright-core's chromium.launch()
      // with stealth patches and downloads its own patched Chromium binary via ensureBinary().
      const { launch, ensureBinary } = await import("cloakbrowser");
      await ensureBinary();
      return launch({ headless: true });
    })();
  }
  return browserPromise;
}

function delay(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Fetch a URL and return a parsed DOM Document. Polite: a jittered delay before navigation.
export async function fetchDocument(url, { waitFor } = {}) {
  const browser = await getBrowser();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await delay(1000 + Math.random() * 2000);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 15000 }).catch(() => {});
    const html = await page.content();
    return parseHtml(html);
  } finally {
    await context.close();
  }
}

export async function closeBrowser() {
  if (browserPromise) {
    const b = await browserPromise;
    await b.close();
    browserPromise = null;
  }
}
