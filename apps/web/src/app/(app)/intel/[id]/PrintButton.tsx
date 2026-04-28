'use client';

export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-md border border-white/60 bg-white px-3 py-2 text-sm hover:bg-white/80"
    >
      Print / Save as PDF
    </button>
  );
}
