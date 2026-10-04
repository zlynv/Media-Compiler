import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const store = await db();
  const build = store.builds.find((b) => b.id === id);
  if (!build) return NextResponse.json({ error: "Build not found" }, { status: 404 });
  const qa = store.qaResults.filter((q) => q.buildId === id);
  const artifacts = store.artifacts.filter((a) => a.buildId === id);
  return NextResponse.json({ qa, artifacts });
}
