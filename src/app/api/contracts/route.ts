import { NextResponse } from "next/server";
import { contractInputSchema } from "@/lib/contracts";
import { db, persist, uid } from "@/lib/store";

export async function GET() {
  const store = await db();
  return NextResponse.json({ contracts: store.contracts });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = contractInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid contract", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const store = await db();
  const now = new Date().toISOString();
  const contract = {
    id: uid("contract"),
    ...parsed.data,
    version: 1,
    history: [],
    status: "ACTIVE" as const,
    createdAt: now,
    updatedAt: now,
  };
  store.contracts.unshift(contract);
  await persist();
  return NextResponse.json({ contract }, { status: 201 });
}
