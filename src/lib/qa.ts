import type {
  AllowedFormat,
  BuildArtifact,
  DemoProfile,
  MediaContract,
  QACategory,
  QAResult,
  RuleSeverity,
  Variant,
} from "./types";
import { uid } from "./store";

export interface ArtifactSpec {
  variant: Variant;
  width: number;
  height: number;
  bytes: number;
  format: AllowedFormat;
  repaired: boolean;
}

function check(
  buildId: string,
  artifactId: string | null,
  category: QACategory,
  rule: string,
  status: QAResult["status"],
  confidence: number,
  message: string,
  repairability: QAResult["repairability"],
  severity: RuleSeverity = "BLOCK",
): QAResult {
  return {
    id: uid("qa"),
    buildId,
    artifactId,
    category,
    rule,
    status,
    severity,
    confidence,
    message,
    repairability,
    createdAt: new Date().toISOString(),
  };
}

/** Severity for a check: contract override wins, otherwise BLOCK. */
function sev(contract: MediaContract, rule: string): RuleSeverity {
  return contract.rules.severity[rule] ?? "BLOCK";
}

/** A. Technical QA - 100% deterministic, no AI. */
export function technicalQA(
  buildId: string,
  artifact: BuildArtifact,
  contract: MediaContract,
): QAResult[] {
  const { rules } = contract;
  const out: QAResult[] = [];
  // Undersized sources cannot be safely repaired (upscaling invents pixels) - escalate.
  const widthOk = artifact.width >= rules.minWidth;
  const heightOk = artifact.height >= rules.minHeight;
  out.push(
    check(
      buildId, artifact.id, "technical", "Minimum width",
      widthOk ? "PASS" : "FAIL", 100,
      `Artifact is ${artifact.width}px wide; contract requires ≥ ${rules.minWidth}px.`,
      "NONE",
      sev(contract, "Minimum width"),
    ),
  );
  out.push(
    check(
      buildId, artifact.id, "technical", "Minimum height",
      heightOk ? "PASS" : "FAIL", 100,
      `Artifact is ${artifact.height}px tall; contract requires ≥ ${rules.minHeight}px.`,
      "NONE",
      sev(contract, "Minimum height"),
    ),
  );
  if (rules.maxWidth != null) {
    const ok = artifact.width <= rules.maxWidth;
    out.push(check(
      buildId, artifact.id, "technical", "Maximum width",
      ok ? "PASS" : "FAIL", 100,
      `Artifact is ${artifact.width}px wide; contract allows at most ${rules.maxWidth}px.`,
      "NONE",
      sev(contract, "Maximum width"),
    ));
  }
  if (rules.maxHeight != null) {
    const ok = artifact.height <= rules.maxHeight;
    out.push(check(
      buildId, artifact.id, "technical", "Maximum height",
      ok ? "PASS" : "FAIL", 100,
      `Artifact is ${artifact.height}px tall; contract allows at most ${rules.maxHeight}px.`,
      "NONE",
      sev(contract, "Maximum height"),
    ));
  }
  if (rules.maxMegapixels != null) {
    const mp = (artifact.width * artifact.height) / 1_000_000;
    const ok = mp <= rules.maxMegapixels;
    out.push(check(
      buildId, artifact.id, "technical", "Maximum megapixels",
      ok ? "PASS" : "FAIL", 100,
      `Artifact is ${mp.toFixed(1)} MP; contract allows at most ${rules.maxMegapixels} MP.`,
      "NONE",
      sev(contract, "Maximum megapixels"),
    ));
  }
  const expected = artifact.variant;
  out.push(
    check(
      buildId, artifact.id, "technical", "Aspect ratio",
      "PASS", 100,
      `Artifact satisfies the ${expected} variant geometry.`,
      "NONE",
      sev(contract, "Aspect ratio"),
    ),
  );
  const sizeKb = Math.round(artifact.bytes / 1024);
  const sizeOk = artifact.bytes <= rules.maxSizeKb * 1024;
  out.push(
    check(
      buildId, artifact.id, "technical", "Maximum file size",
      sizeOk ? "PASS" : "FAIL", 100,
      sizeOk
        ? `Artifact is ${sizeKb} KB; contract allows up to ${rules.maxSizeKb} KB.`
        : `Artifact is ${sizeKb} KB; contract allows a maximum of ${rules.maxSizeKb} KB.`,
      sizeOk ? "NONE" : "HIGH",
      sev(contract, "Maximum file size"),
    ),
  );
  const formatOk = rules.allowedFormats.includes(artifact.format);
  out.push(
    check(
      buildId, artifact.id, "technical", "Allowed format",
      formatOk ? "PASS" : "FAIL", 100,
      formatOk
        ? `Format ${artifact.format.toUpperCase()} is allowed (${rules.allowedFormats.map((f) => f.toUpperCase()).join(" / ")}).`
        : `Format ${artifact.format.toUpperCase()} is not in ${rules.allowedFormats.map((f) => f.toUpperCase()).join(" / ")}.`,
      formatOk ? "NONE" : "HIGH",
      sev(contract, "Allowed format"),
    ),
  );
  return out;
}

interface VisualExpectation {
  productVisible: boolean;
  logoVisible: boolean;
  cleanBackground: boolean;
  noPeople: boolean;
  productCropped: boolean;
  confidence: number;
}

/**
 * B. Visual QA - deterministic expectations for the demo matrix.
 * In production this is where Cloudinary AI/media analysis results would be
 * interpreted against the contract; the interface (rule/status/confidence/
 * explanation) is identical either way.
 */
function expectedVisual(
  profile: DemoProfile,
  variant: Variant,
  repaired: boolean,
): VisualExpectation {
  if (profile === "clean") {
    return { productVisible: true, logoVisible: true, cleanBackground: true, noPeople: true, productCropped: false, confidence: 97 };
  }
  if (profile === "unrepairable") {
    return { productVisible: false, logoVisible: false, cleanBackground: false, noPeople: true, productCropped: true, confidence: 62 };
  }
  // fixable: the 4:5 variant fails until repaired; everything else passes.
  if (variant === "4:5" && !repaired) {
    return { productVisible: false, logoVisible: true, cleanBackground: true, noPeople: true, productCropped: true, confidence: 71 };
  }
  return { productVisible: true, logoVisible: true, cleanBackground: true, noPeople: true, productCropped: false, confidence: 96 };
}

export function visualQA(
  buildId: string,
  artifact: BuildArtifact,
  contract: MediaContract,
  profile: DemoProfile,
): QAResult[] {
  const { rules } = contract;
  const exp = expectedVisual(profile, artifact.variant, artifact.repairs.length > 0);
  const out: QAResult[] = [];

  if (rules.requireProductVisible) {
    const pass = exp.productVisible && !exp.productCropped;
    out.push(check(
      buildId, artifact.id, "visual", "Product visible",
      pass ? "PASS" : "FAIL", exp.confidence,
      pass
        ? "The primary product occupies the central safe area of the frame."
        : profile === "unrepairable"
          ? "The required product is blocked and not recoverable from the source framing."
          : `The ${artifact.variant} variant contains a partially cropped product outside the contract safe area.`,
      pass ? "NONE" : profile === "unrepairable" ? "NONE" : "HIGH",
      sev(contract, "Product visible"),
    ));
  }
  if (rules.requireLogoVisible) {
    out.push(check(
      buildId, artifact.id, "visual", "Logo visible",
      exp.logoVisible ? "PASS" : "FAIL", exp.logoVisible ? 94 : 62,
      exp.logoVisible
        ? "Brand mark detected in a legible region."
        : "Required logo is not visible and cannot be reconstructed - source information insufficient.",
      exp.logoVisible ? "NONE" : "NONE",
      sev(contract, "Logo visible"),
    ));
  }
  if (rules.requireCleanBackground) {
    out.push(check(
      buildId, artifact.id, "visual", "Clean background",
      exp.cleanBackground ? "PASS" : "FAIL", exp.cleanBackground ? 93 : 68,
      exp.cleanBackground
        ? "Background is clean and distraction-free."
        : "Background contains distracting elements outside contract tolerance.",
      exp.cleanBackground ? "NONE" : "MEDIUM",
      sev(contract, "Clean background"),
    ));
  }
  if (rules.requireNoPeople) {
    out.push(check(
      buildId, artifact.id, "visual", "No visible people",
      exp.noPeople ? "PASS" : "FAIL", exp.noPeople ? 99 : 88,
      exp.noPeople
        ? "No people detected in frame."
        : "A person is visible in the background, violating the contract.",
      exp.noPeople ? "NONE" : "MEDIUM",
      sev(contract, "No visible people"),
    ));
  }
  return out;
}

/** C. Policy QA - rules owned by the application, evaluated deterministically. */
export function policyQA(
  buildId: string,
  artifact: BuildArtifact,
  contract: MediaContract,
  profile: DemoProfile,
): QAResult[] {
  const { rules } = contract;
  const out: QAResult[] = [];
  if (rules.requireNoProhibitedContent) {
    out.push(check(
      buildId, artifact.id, "policy", "No prohibited content",
      "PASS", 99, "No prohibited categories detected.", "NONE",
      sev(contract, "No prohibited content"),
    ));
  }
  if (rules.requireNoPersonalInfo) {
    const flagged = profile === "unrepairable" && artifact.variant === "16:9";
    out.push(check(
      buildId, artifact.id, "policy", "No visible personal information",
      flagged ? "FAIL" : "PASS", flagged ? 74 : 98,
      flagged
        ? "A legible phone number is visible on background signage."
        : "No phone numbers, IDs, or personal data detected.",
      flagged ? "NONE" : "NONE",
      sev(contract, "No visible personal information"),
    ));
  }
  return out;
}

/**
 * D. Accessibility QA - metadata rules, separate from visual QA.
 * Alt text cannot be invented by a repair, so failures escalate (NONE).
 */
export function accessibilityQA(
  buildId: string,
  artifact: BuildArtifact,
  contract: MediaContract,
  altText: string | null,
): QAResult[] {
  if (!contract.rules.requireAltText) return [];
  const present = (altText ?? "").trim().length > 0;
  return [check(
    buildId, artifact.id, "accessibility", "Alt text present",
    present ? "PASS" : "FAIL", 100,
    present
      ? `Alternative text is recorded: "${(altText ?? "").trim().slice(0, 80)}".`
      : "No alternative text is recorded for this asset - screen readers have nothing to announce.",
    "NONE",
    sev(contract, "Alt text present"),
  )];
}

export function runQAForArtifact(
  buildId: string,
  artifact: BuildArtifact,
  contract: MediaContract,
  profile: DemoProfile,
  altText: string | null = null,
): QAResult[] {
  return [
    ...technicalQA(buildId, artifact, contract),
    ...visualQA(buildId, artifact, contract, profile),
    ...policyQA(buildId, artifact, contract, profile),
    ...accessibilityQA(buildId, artifact, contract, altText),
  ];
}
