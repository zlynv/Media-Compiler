/** Media Compiler - shared domain types.
 *
 * Central product abstraction:
 *   Media Contract → Build → Test → Repair → Re-test → Release
 */

export type BuildStatus =
  | "QUEUED"
  | "BUILDING"
  | "ANALYZING"
  | "TESTING"
  | "REPAIRING"
  | "RETESTING"
  | "PASSED"
  | "REVIEW_REQUIRED"
  | "FAILED"
  | "RELEASED";

export type QAStatus = "PASS" | "FAIL" | "WARNING" | "SKIPPED";

/** BLOCK prevents release. WARN ships but appears in the release report. INFO is recorded only. */
export type RuleSeverity = "BLOCK" | "WARN" | "INFO";

export type QACategory = "technical" | "visual" | "policy" | "accessibility";

export type Variant = "1:1" | "4:5" | "16:9";

export type AllowedFormat = "webp" | "avif" | "jpeg";

export interface ContractRules {
  minWidth: number;
  minHeight: number;
  /** Optional ceilings (null = off). Real deterministic checks. */
  maxWidth: number | null;
  maxHeight: number | null;
  maxMegapixels: number | null;
  maxSizeKb: number;
  allowedFormats: AllowedFormat[];
  requireProductVisible: boolean;
  requireLogoVisible: boolean;
  requireCleanBackground: boolean;
  requireNoPeople: boolean;
  requireNoProhibitedContent: boolean;
  requireNoPersonalInfo: boolean;
  requireAltText: boolean;
  /** Per-check severity overrides (check name → severity). Absent = BLOCK. */
  severity: Partial<Record<string, RuleSeverity>>;
}

export interface RepairPolicy {
  autoRepair: boolean;
  retestAfterRepair: boolean;
  sendToReview: boolean;
  /** Repair budget: attempts per artifact before escalation (default 2). */
  maxRepairAttempts: number;
}

export interface ContractVersionSnapshot {
  version: number;
  variants: Variant[];
  rules: ContractRules;
  repairPolicy: RepairPolicy;
  updatedAt: string;
}

export interface MediaContract {
  id: string;
  name: string;
  description: string;
  /** Monotonic version - incremented on every edit. Builds pin the version they compiled against. */
  version: number;
  /** Immutable snapshots of previous versions (oldest first). Powers Compare Versions. */
  history: ContractVersionSnapshot[];
  variants: Variant[];
  rules: ContractRules;
  repairPolicy: RepairPolicy;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: string;
  updatedAt: string;
}

/** Deterministic demo behaviour attached to a source asset. */
export type DemoProfile = "clean" | "fixable" | "unrepairable";

export interface SourceAsset {
  id: string;
  name: string;
  cloudinaryPublicId: string | null;
  secureUrl: string;
  previewUrl: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  /** Accessibility text (defaults to the file name; editable on the asset). */
  altText: string | null;
  demoProfile: DemoProfile;
  createdAt: string;
}

export interface BuildArtifact {
  id: string;
  buildId: string;
  variant: Variant;
  /** Monotonic version per (build, variant). Repair creates v2, keeping v1 for lineage. */
  version: number;
  /** Previous version's artifact id (null for v1). Forms the lineage chain. */
  parentId: string | null;
  width: number;
  height: number;
  bytes: number;
  format: AllowedFormat;
  secureUrl: string;
  previewUrl: string;
  cloudinaryPublicId: string | null;
  derivation: string;
  status: QAStatus;
  repairs: string[];
  createdAt: string;
}

export interface QAResult {
  id: string;
  buildId: string;
  artifactId: string | null;
  category: QACategory;
  rule: string;
  status: QAStatus;
  severity: RuleSeverity;
  confidence: number;
  message: string;
  repairability: "HIGH" | "MEDIUM" | "NONE";
  createdAt: string;
}

export type RepairStrategy =
  | "smart_crop"
  | "q_auto"
  | "format_convert"
  | "background_cleanup";

export type RepairResult = "APPLIED" | "REJECTED" | "FAILED";

export interface RepairAction {
  id: string;
  buildId: string;
  artifactId: string;
  strategy: RepairStrategy;
  reason: string;
  result: RepairResult;
  createdAt: string;
}

export type ReviewDecision = "PENDING" | "APPROVED" | "REJECTED";

export interface ReviewItem {
  id: string;
  buildId: string;
  artifactId: string;
  assetName: string;
  previewUrl: string;
  issue: string;
  reason: string;
  confidence: number;
  suggestedAction: string;
  decision: ReviewDecision;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ReleaseArtifact {
  variant: Variant;
  status: "passed";
  repairs: string[];
  secureUrl: string;
  previewUrl: string;
  /** Measured derived bytes - per-asset savings are computed from real numbers. */
  bytes: number;
}

export interface ReleaseManifest {
  releaseId: string;
  contractId: string;
  contractName: string;
  buildId: string;
  sourceAsset: string;
  /** Master source bytes, for honest original → released comparison. */
  sourceBytes: number;
  /** Only one LIVE release per contract; rollback creates a new record, never mutates history. */
  status: "LIVE" | "SUPERSEDED";
  /** Set when this release is a rollback re-publication of an older release. */
  rollbackOf: string | null;
  artifacts: ReleaseArtifact[];
  unresolvedFailures: number;
  /** WARN-severity failures that shipped with the release (visible, non-blocking). */
  warnings: string[];
  repairCount: number;
  releasedAt: string;
}

export interface BuildEvent {
  id: string;
  buildId: string;
  at: string;
  message: string;
  status: "ok" | "fail" | "run";
  durationMs: number;
}

export interface Build {
  id: string;
  number: number;
  contractId: string;
  contractName: string;
  /** Pinned contract version + full rule snapshot taken at compile time (auditability). */
  contractVersion: number;
  contractSnapshot: Pick<MediaContract, "variants" | "rules" | "repairPolicy">;
  sourceAssetId: string;
  sourceAssetName: string;
  status: BuildStatus;
  sourcePreviewUrl: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  releaseId: string | null;
}

export const BUILD_STATUS_LABEL: Record<BuildStatus, string> = {
  QUEUED: "Queued",
  BUILDING: "Building",
  ANALYZING: "Analyzing",
  TESTING: "Testing",
  REPAIRING: "Repairing",
  RETESTING: "Re-testing",
  PASSED: "Passed",
  REVIEW_REQUIRED: "Needs review",
  FAILED: "Failed",
  RELEASED: "Released",
};

export const TERMINAL_STATUSES: BuildStatus[] = [
  "PASSED",
  "REVIEW_REQUIRED",
  "FAILED",
  "RELEASED",
];

export function isTerminal(status: BuildStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
