import { NextResponse } from "next/server";
import { getRegression } from "@/lib/engine";
import { db } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await db();
  const build = store.builds.find((b) => b.id === id);
  if (!build) return NextResponse.json({ error: "Build not found" }, { status: 404 });
  const contract = store.contracts.find((c) => c.id === build.contractId) ?? null;
  const asset = store.assets.find((a) => a.id === build.sourceAssetId) ?? null;
  const artifacts = store.artifacts.filter((a) => a.buildId === id);
  const qa = store.qaResults.filter((q) => q.buildId === id);
  const repairs = store.repairs.filter((r) => r.buildId === id);
  const events = store.events.filter((e) => e.buildId === id);
  const release = store.releases.find((r) => r.buildId === id) ?? null;
  const regression = await getRegression(id);
  return NextResponse.json({ build, contract, asset, artifacts, qa, repairs, events, release, regression });
}
