import { NextResponse } from "next/server";
import { z } from "zod";
import { assetInputSchema } from "@/lib/contracts";
import { db, persist, uid } from "@/lib/store";

export async function GET() {
  const store = await db();
  return NextResponse.json({ assets: store.assets });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = assetInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid asset", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }
  const store = await db();
  const asset = {
    id: uid("asset"),
    name: parsed.data.name,
    secureUrl: parsed.data.secureUrl,
    previewUrl: parsed.data.previewUrl ?? parsed.data.secureUrl,
    cloudinaryPublicId: parsed.data.cloudinaryPublicId ?? null,
    width: parsed.data.width,
    height: parsed.data.height,
    bytes: parsed.data.bytes,
    format: parsed.data.format,
    altText: parsed.data.altText ?? parsed.data.name,
    demoProfile: parsed.data.demoProfile ?? ("clean" as const),
    createdAt: new Date().toISOString(),
  };
  store.assets.unshift(asset);
  await persist();
  return NextResponse.json({ asset }, { status: 201 });
}

const patchSchema = z.object({
  id: z.string().min(1),
  altText: z.string().trim().max(300).nullable(),
});

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "id and altText are required" }, { status: 422 });
  }
  const store = await db();
  const asset = store.assets.find((a) => a.id === parsed.data.id);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  asset.altText = parsed.data.altText ?? asset.name;
  await persist();
  return NextResponse.json({ asset });
}
