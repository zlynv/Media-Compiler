import { NextResponse } from "next/server";
import { explainBuild, releaseBuild } from "@/lib/engine";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const explanation = await explainBuild(id);
    return NextResponse.json({ explanation });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Explain failed" },
      { status: 404 },
    );
  }
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const release = await releaseBuild(id);
    return NextResponse.json({ release }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Release blocked" },
      { status: 409 },
    );
  }
}
