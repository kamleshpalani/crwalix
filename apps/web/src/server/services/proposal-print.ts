/**
 * Render a print-ready HTML page for a proposal. Opening this page in a
 * browser shows the proposal styled for an A4 page and auto-triggers
 * the print dialog so users can "Save as PDF" without us shipping a
 * headless Chromium dependency.
 *
 * Trade-off: not a "true" server-rendered PDF binary, but works on
 * any serverless host, has zero runtime deps, and matches the visual
 * fidelity of the public viewer exactly. If/when we need a real PDF
 * binary (e.g. for emailing as attachment), swap this template for
 * `puppeteer-core` + `@sparticuz/chromium`.
 */
export interface PrintableProposal {
  readonly organizationName: string;
  readonly dealTitle: string;
  readonly version: number;
  readonly status: string;
  readonly bodyHtml: string;
  readonly createdAt: string | Date;
}

export function renderProposalPrintHtml(p: PrintableProposal): string {
  const created =
    typeof p.createdAt === "string"
      ? p.createdAt
      : p.createdAt.toISOString().slice(0, 10);
  const safeTitle = escapeHtml(p.dealTitle);
  const safeOrg = escapeHtml(p.organizationName);
  const safeStatus = escapeHtml(p.status);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${safeTitle} — Proposal v${p.version}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #f8fafc; color: #0f172a;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px; line-height: 1.6; }
    .page {
      max-width: 780px; margin: 32px auto; background: #fff;
      border: 1px solid #e2e8f0; border-radius: 12px; padding: 56px 64px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }
    header { border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 28px;
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
    header .org { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; }
    header h1 { margin: 4px 0 0; font-size: 24px; font-weight: 600; }
    header .meta { font-size: 11px; color: #475569; text-align: right; white-space: nowrap; }
    article { font-size: 14px; color: #1e293b; }
    article h1, article h2, article h3 { color: #0f172a; }
    article h1 { font-size: 22px; margin: 24px 0 12px; }
    article h2 { font-size: 18px; margin: 20px 0 10px; }
    article h3 { font-size: 15px; margin: 16px 0 8px; }
    article p { margin: 0 0 12px; }
    article ul, article ol { margin: 0 0 12px; padding-left: 22px; }
    article li { margin: 4px 0; }
    article table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    article th, article td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
    article th { background: #f1f5f9; }
    footer { margin-top: 36px; padding-top: 16px; border-top: 1px solid #e2e8f0;
      font-size: 11px; color: #94a3b8; text-align: center; }
    .toolbar { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; }
    .toolbar button { background: #0f172a; color: #fff; border: 0; border-radius: 8px;
      padding: 8px 14px; font-size: 13px; cursor: pointer; }
    .toolbar button.secondary { background: #fff; color: #0f172a; border: 1px solid #cbd5e1; }
    @page { size: A4; margin: 18mm; }
    @media print {
      body { background: #fff; }
      .page { margin: 0; border: 0; box-shadow: none; padding: 0; max-width: none; }
      .toolbar { display: none; }
    }
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="secondary" type="button" onclick="window.close()">Close</button>
    <button type="button" onclick="window.print()">Save as PDF</button>
  </div>
  <main class="page">
    <header>
      <div>
        <div class="org">${safeOrg}</div>
        <h1>${safeTitle}</h1>
      </div>
      <div class="meta">
        v${p.version} · ${safeStatus}<br/>
        ${escapeHtml(created)}
      </div>
    </header>
    <article>${p.bodyHtml}</article>
    <footer>Powered by Crawlix</footer>
  </main>
  <script>
    // Auto-open print dialog once fonts/layout settle.
    window.addEventListener('load', function () {
      setTimeout(function () { window.print(); }, 350);
    });
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
