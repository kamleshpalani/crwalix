export default function ExportsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Exports</h1>
      <p className="mt-1 text-sm text-slate-600">
        Download scored leads as CSV.
      </p>
      <div className="mt-6 rounded-md border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Coming soon. Exports will appear here once generated via{' '}
        <code className="rounded bg-slate-100 px-1">POST /api/v1/exports</code>.
      </div>
    </div>
  );
}
