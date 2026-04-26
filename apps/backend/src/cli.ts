#!/usr/bin/env node
import { Command } from 'commander';
import { getAdapter, listAdapters } from './adapters/registry.js';
import { acquirePage, shutdownBrowser } from './engine/browser.js';
import { logger } from './utils/logger.js';

const program = new Command();
program.name('crawlix').description('Crawlix CLI').version('0.1.0');

program
  .command('adapters')
  .description('List available adapters')
  .action(() => {
    for (const a of listAdapters()) {
      console.log(`- ${a.name}: ${a.description}`);
    }
  });

program
  .command('run')
  .description('Run an adapter once and print JSON output')
  .requiredOption('-a, --adapter <name>', 'Adapter name')
  .requiredOption('-i, --input <json>', 'Input JSON string')
  .action(async (opts: { adapter: string; input: string }) => {
    const adapter = getAdapter(opts.adapter);
    if (!adapter) {
      console.error(`Unknown adapter: ${opts.adapter}`);
      process.exit(1);
    }
    const parsed = adapter.inputSchema.safeParse(JSON.parse(opts.input));
    if (!parsed.success) {
      console.error('Invalid input:', parsed.error.issues);
      process.exit(1);
    }

    const acquired = await acquirePage();
    const controller = new AbortController();
    try {
      const result = await adapter.run(parsed.data as never, {
        page: acquired.page,
        logger,
        signal: controller.signal,
        onProgress: () => undefined,
      });
      console.log(JSON.stringify(result, null, 2));
    } finally {
      await acquired.release();
      await shutdownBrowser();
    }
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});
