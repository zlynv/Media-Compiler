import { NextResponse } from "next/server";
import { db } from "@/lib/store";

export async function GET() {
  const store = await db();
  return NextResponse.json({ releases: store.releases });
}
