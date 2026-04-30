import { notFound } from "next/navigation";
import { quoteService } from "@/server/services/quote.service";
import QuoteShareClient from "./QuoteShareClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public quote view. No auth — anyone with the share token can see it.
 */
export default async function QuoteSharePage({
  params,
}: {
  params: { token: string };
}) {
  const quote = await quoteService.getByShareToken(params.token);
  if (!quote) notFound();
  return <QuoteShareClient quote={quote} token={params.token} />;
}
