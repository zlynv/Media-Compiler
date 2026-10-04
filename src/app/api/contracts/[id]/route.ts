import { NextResponse } from "next/server";
import { contractInputSchema } from "@/lib/contracts";
import { db, persist } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await db();
  const contract = store.contracts.find((c) => c.id === id);
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  const builds = store.builds.filter((b) => b.contractId === id).slice(0, 20);
  return NextResponse.json({ contract, builds });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = contractInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid contract", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const store = await db();
  const contract = store.contracts.find((c) => c.id === id);
  if (!contract) return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  // Freeze the superseded version for Compare Versions (oldest first).
  contract.history.push({
    version: contract.version,
    variants: [...contract.variants],
    rules: { ...contract.rules, allowedFormats: [...contract.rules.allowedFormats] },
    repairPolicy: { ...contract.repairPolicy },
    updatedAt: contract.updatedAt,
  });
  Object.assign(contract, parsed.data, {
    version: contract.version + 1,
    updatedAt: new Date().toISOString(),
  });
  await persist();
  return NextResponse.json({ contract });
}
