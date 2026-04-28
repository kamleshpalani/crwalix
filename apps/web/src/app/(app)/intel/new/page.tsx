import { requireOrg, isResponse, isAuthError } from '@/lib/auth';
import NoOrgBanner from '@/components/NoOrgBanner';
import NewIntelForm from './NewIntelForm';

export default async function NewIntelPage() {
  const ctx = await requireOrg();
  if (isResponse(ctx)) return null;
  if (isAuthError(ctx)) return <NoOrgBanner />;

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">New intelligence report</h1>
      <p className="mt-1 text-sm text-ink-600">
        Audit a business website and compare it side-by-side with its competitors.
      </p>
      <div className="mt-6">
        <NewIntelForm />
      </div>
    </div>
  );
}
