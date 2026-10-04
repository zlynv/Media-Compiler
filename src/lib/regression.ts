import type { BuildArtifact } from "./types";

export type RegressionStatus = "PASS" | "WARNING" | "FAIL";

export interface RegressionRow {
  variant: string;
  status: RegressionStatus;
  baselineBytes: number;
  candidateBytes: number;
  deltaPct: number;
  details: string[];
}

export interface RegressionReport {
  baselineRef: string;
  rows: RegressionRow[];
  blocking: boolean;
}

export const REGRESSION_WARN_PCT = 25;

/**
 * Media regression test: compare candidate artifacts against the baseline
 * (latest prior release of the same contract). Dimension or format changes
 * FAIL (blocking); large size swings WARN. Pure metadata comparison -
 * deterministic, genuinely computed from measured artifacts.
 */
export function compareRegression(
  baseline: BuildArtifact[],
  candidate: BuildArtifact[],
  baselineRef: string,
): RegressionReport {
  const rows: RegressionRow[] = [];
  for (const c of candidate) {
    const b = baseline.find((x) => x.variant === c.variant);
    if (!b) {
      rows.push({
        variant: c.variant, status: "WARNING",
        baselineBytes: 0, candidateBytes: c.bytes, deltaPct: 0,
        details: ["No baseline for this variant - first appearance."],
      });
      continue;
    }
    const details: string[] = [];
    let status: RegressionStatus = "PASS";
    if (b.width !== c.width || b.height !== c.height) {
      status = "FAIL";
      details.push(`Dimensions changed ${b.width}×${b.height} → ${c.width}×${c.height}.`);
    }
    if (b.format !== c.format) {
      status = "FAIL";
      details.push(`Format changed ${b.format.toUpperCase()} → ${c.format.toUpperCase()}.`);
    }
    const deltaPct = b.bytes === 0 ? 0 : Math.round(((c.bytes - b.bytes) / b.bytes) * 100);
    if (status === "PASS" && Math.abs(deltaPct) > REGRESSION_WARN_PCT) {
      status = "WARNING";
      details.push(`Size shifted ${deltaPct > 0 ? "+" : ""}${deltaPct}% vs baseline.`);
    }
    if (details.length === 0) details.push("Matches baseline.");
    rows.push({ variant: c.variant, status, baselineBytes: b.bytes, candidateBytes: c.bytes, deltaPct, details });
  }
  return { baselineRef, rows, blocking: rows.some((r) => r.status === "FAIL") };
}
