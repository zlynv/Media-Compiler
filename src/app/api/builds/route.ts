import { NextResponse } from "next/server";
import { z } from "zod";
import { compile } from "@/lib/engine";
import { db } from "@/lib/store";

const compileSchema = z.object({
  sourceAssetId: z.string().min(1),
  contractId: z.string().min(1),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const store = await db();
  const builds = status
    ? store.builds.filter((b) => b.status === status)
    : store.builds;
  const repairsByBuild: Record<string, number> = {};
  for (const r of store.repairs) repairsByBuild[r.buildId] = (repairsByBuild[r.buildId] ?? 0) + 1;
  return NextResponse.json({ builds, repairsByBuild });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = compileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "sourceAssetId and contractId are required" }, { status: 422 });
  }
  try {
    const build = await compile(parsed.data.sourceAssetId, parsed.data.contractId);
    return NextResponse.json({ build }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Compile failed" },
      { status: 400 },
    );
  }
}
