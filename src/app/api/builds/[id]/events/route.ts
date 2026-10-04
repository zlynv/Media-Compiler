import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");
  const store = await db();
  const build = store.builds.find((b) => b.id === id);
  if (!build) return NextResponse.json({ error: "Build not found" }, { status: 404 });
  let events = store.events.filter((e) => e.buildId === id);
  if (since) events = events.filter((e) => e.at > since);
  return NextResponse.json({ status: build.status, events });
}
