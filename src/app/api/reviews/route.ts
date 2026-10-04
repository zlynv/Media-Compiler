import { NextResponse } from "next/server";
import { z } from "zod";
import { db, persist } from "@/lib/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const decision = searchParams.get("decision");
  const store = await db();
  const reviews = decision
    ? store.reviews.filter((r) => r.decision === decision)
    : store.reviews;
  return NextResponse.json({ reviews });
}

const decideSchema = z.object({
  reviewId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = decideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "reviewId and decision are required" }, { status: 422 });
  }
  const store = await db();
  const review = store.reviews.find((r) => r.id === parsed.data.reviewId);
  if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 });
  review.decision = parsed.data.decision;
  review.resolvedAt = new Date().toISOString();
  await persist();
  return NextResponse.json({ review });
}
