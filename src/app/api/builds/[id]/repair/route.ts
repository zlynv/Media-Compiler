import { NextResponse } from "next/server";
import { repairBuild } from "@/lib/engine";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const build = await repairBuild(id);
    return NextResponse.json({ build });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Repair failed" },
      { status: 400 },
    );
  }
}
