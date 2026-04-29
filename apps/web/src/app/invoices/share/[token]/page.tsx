import { notFound } from "next/navigation";
import { invoiceService } from "@/server/services/invoice.service";
import InvoiceShareClient from "./InvoiceShareClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function InvoiceSharePage({
  params,
}: {
  params: { token: string };
}) {
  const invoice = await invoiceService.getByShareToken(params.token);
  if (!invoice) notFound();
  return <InvoiceShareClient invoice={invoice} token={params.token} />;
}
