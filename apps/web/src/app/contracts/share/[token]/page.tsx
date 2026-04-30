import { notFound } from "next/navigation";
import { contractService } from "@/server/services/contract.service";
import ContractShareClient from "./ContractShareClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function ContractSharePage({
  params,
}: {
  params: { token: string };
}) {
  const contract = await contractService.getByShareToken(params.token);
  if (!contract) notFound();
  return <ContractShareClient contract={contract} token={params.token} />;
}
