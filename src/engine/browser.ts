import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    logger.info({ headless: config.HEADLESS }, 'Launching Chromium');
    browserPromise = chromium.launch({ headless: config.HEADLESS });
  }
  return browserPromise;
}

export interface AcquiredPage {
  page: Page;
  context: BrowserContext;
  release: () => Promise<void>;
}

export async function acquirePage(opts?: {
  locale?: string;
  userAgent?: string;
}): Promise<AcquiredPage> {
  const browser = await getBrowser();
  const context = await browser.newContext({
    locale: opts?.locale ?? config.DEFAULT_LOCALE,
    userAgent: opts?.userAgent ?? config.DEFAULT_USER_AGENT,
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(config.NAV_TIMEOUT_MS);
  page.setDefaultTimeout(config.NAV_TIMEOUT_MS);

  return {
    page,
    context,
    release: async () => {
      await context.close().catch(() => undefined);
    },
  };
}

export async function shutdownBrowser(): Promise<void> {
  if (!browserPromise) return;
  const b = await browserPromise.catch(() => null);
  browserPromise = null;
  if (b) await b.close().catch(() => undefined);
}
