import { v2 as cloudinary } from "cloudinary";
import { VARIANT_TRANSFORM, type ArtifactPlan } from "./transform-map";

export { derivationFor, planArtifacts, ruleMappingRows, VARIANT_TRANSFORM, type ArtifactPlan } from "./transform-map";
import type { AllowedFormat } from "./types";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;
  if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
    return true;
  }
  return false;
}

export function isCloudinaryConfigured(): boolean {
  return ensureConfigured();
}

export function cloudName(): string {
  return process.env.CLOUDINARY_CLOUD_NAME ?? "";
}

/** Media Contract → Cloudinary transformation mapping lives in ./transform-map
 *  (client-safe); this adapter re-exports it and adds SDK-backed operations. */

/**
 * Delivery URL for a derived artifact.
 * Real Cloudinary transformation URL whenever the source has a publicId;
 * deterministic demo delivery otherwise (used only when Cloudinary is not
 * configured). `repaired` switches gravity to auto and enables q_auto.
 */
export function artifactUrl(
  source: { secureUrl: string; cloudinaryPublicId: string | null },
  plan: ArtifactPlan,
  repaired: boolean,
): string {
  if (source.cloudinaryPublicId && ensureConfigured()) {
    const t = VARIANT_TRANSFORM[plan.variant];
    const optimized = plan.optimized || repaired;
    return cloudinary.url(source.cloudinaryPublicId, {
      transformation: [
        {
          crop: "fill",
          aspect_ratio: t.aspectRatio,
          width: plan.width,
          height: plan.height,
          gravity: repaired ? "auto" : "center",
        },
        optimized
          ? { fetch_format: "auto", quality: "auto" }
          : { fetch_format: "jpg", quality: 100 },
      ],
      secure: true,
    });
  }
  const t = VARIANT_TRANSFORM[plan.variant];
  const seed = repaired ? "mc-fixed" : "mc-raw";
  return `https://picsum.photos/seed/${seed}-${plan.variant.replace(":", "x")}/${t.width}/${t.height}`;
}

export interface DerivedMeasurement {
  bytes: number;
  format: AllowedFormat;
}

const CONTENT_TYPE_FORMAT: Record<string, AllowedFormat> = {
  "image/webp": "webp",
  "image/avif": "avif",
  "image/jpeg": "jpeg",
};

/**
 * Genuinely measure a derived artifact: HEAD the delivery URL with a
 * browser-like Accept header and read Content-Length / Content-Type.
 * Returns null when the asset cannot be reached (caller falls back).
 */
export async function measureDerived(url: string): Promise<DerivedMeasurement | null> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: { Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" },
    });
    if (!res.ok) return null;
    const len = res.headers.get("content-length");
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!len || !CONTENT_TYPE_FORMAT[type]) return null;
    return { bytes: Number(len), format: CONTENT_TYPE_FORMAT[type] };
  } catch {
    return null;
  }
}

/** Signed params for client-side unsigned uploads (Upload Widget). */
export function uploadPreset(): string {
  return process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";
}

export async function assetDetails(publicId: string) {
  if (!ensureConfigured()) throw new Error("Cloudinary is not configured");
  return cloudinary.api.resource(publicId, {
    image_metadata: true,
    colors: true,
  });
}

export function taggedBuildContext(buildId: string, contractId: string) {
  return `build=${buildId}|contract=${contractId}|app=media-compiler`;
}

/**
 * Attach contract/build context metadata to a Cloudinary asset (audit trail
 * on the asset itself). Best-effort: never throws, never blocks the build.
 */
export async function tagBuildContext(
  publicId: string | null,
  context: Record<string, string>,
): Promise<void> {
  if (!publicId || !ensureConfigured()) return;
  try {
    await cloudinary.api.update(publicId, { context });
  } catch {
    // Metadata tagging is auxiliary - a failure must not fail the build.
  }
}
