import type { AllowedFormat, Variant } from "./types";

/**
 * Client-safe contract → Cloudinary transformation mapping (no SDK import,
 * so UI components can render it without pulling the Node SDK into the
 * browser bundle). `cloudinary.ts` re-exports these for server use.
 */
export const VARIANT_TRANSFORM: Record<
  Variant,
  { aspectRatio: string; width: number; height: number; crop: string }
> = {
  "1:1": { aspectRatio: "1:1", width: 1200, height: 1200, crop: "fill" },
  "4:5": { aspectRatio: "4:5", width: 1200, height: 1500, crop: "fill" },
  "16:9": { aspectRatio: "16:9", width: 1920, height: 1080, crop: "fill" },
};

export interface ArtifactPlan {
  variant: Variant;
  transformation: string;
  width: number;
  height: number;
  format: AllowedFormat;
  optimized: boolean;
}

/**
 * Build the deterministic transformation plan for a contract's variants.
 * Variants listed in `unoptimized` are derived without quality optimization
 * (high-quality JPEG) - this is the seeded fault behind the demo's failing
 * 4:5: the master was exported without optimization, so the artifact
 * genuinely exceeds the contract's size limit until `q_auto` repair.
 */
export function planArtifacts(
  variants: Variant[],
  format: AllowedFormat,
  unoptimized: Variant[] = [],
): ArtifactPlan[] {
  return variants.map((variant) => {
    const t = VARIANT_TRANSFORM[variant];
    const optimized = !unoptimized.includes(variant);
    const plan: ArtifactPlan = {
      variant,
      width: t.width,
      height: t.height,
      format,
      optimized,
      transformation: "",
    };
    plan.transformation = derivationFor(plan, false);
    return plan;
  });
}

/** Exact transformation chain for a plan - matches what `artifactUrl` requests. */
export function derivationFor(plan: ArtifactPlan, repaired: boolean): string {
  const t = VARIANT_TRANSFORM[plan.variant];
  const base = `c_fill,ar_${t.aspectRatio},w_${t.width},h_${t.height}`;
  if (!plan.optimized && !repaired) return `${base},g_center,f_jpg,q_100`;
  if (repaired) return `${base},g_auto,f_${plan.format},q_auto`;
  return `${base},g_center,f_${plan.format},q_auto`;
}

/** Human-readable rule → Cloudinary operation mapping for the UI. */
export function ruleMappingRows(maxSizeKb: number): { rule: string; operation: string }[] {
  return [
    { rule: "Variant geometry (1:1 / 4:5 / 16:9)", operation: "c_fill + aspect ratio crop" },
    { rule: "Subject framing / product visible", operation: "g_auto smart crop on repair" },
    { rule: `File size ≤ ${maxSizeKb} KB`, operation: "f_auto + q_auto optimization" },
    { rule: "Clean background", operation: "background cleanup transformation" },
    { rule: "Format allow-list", operation: "f_auto conversion" },
    { rule: "Logo / policy rules", operation: "structured visual QA evaluation" },
  ];
}
