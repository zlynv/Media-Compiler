import { NextResponse } from "next/server";
import { z } from "zod";
import { rollbackRelease } from "@/lib/engine";

const rollbackSchema = z.object({ releaseId: z.string().min(1) });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = rollbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "releaseId is required" }, { status: 422 });
  }
  try {
    const release = await rollbackRelease(parsed.data.releaseId);
    return NextResponse.json({ release }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rollback failed" },
      { status: 400 },
    );
  }
}
