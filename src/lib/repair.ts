import type { QAResult, RepairStrategy } from "./types";

export interface RepairPlan {
  strategy: RepairStrategy;
  reason: string;
  addressesRules: string[];
}

const STRATEGY_LABEL: Record<RepairStrategy, string> = {
  smart_crop: "Smart crop",
  q_auto: "Automatic quality optimization",
  format_convert: "Format conversion",
  background_cleanup: "Background cleanup",
};

export function strategyLabel(s: RepairStrategy): string {
  return STRATEGY_LABEL[s];
}

/**
 * Failure → repair strategy mapping. Returns null when no safe automatic
 * repair exists (→ human review).
 */
export function planRepair(failures: QAResult[]): RepairPlan[] | null {
  if (failures.length === 0) return [];
  // Any failure explicitly marked unrepairable blocks automatic repair.
  if (failures.some((f) => f.repairability === "NONE")) return null;

  const plans: RepairPlan[] = [];
  const rules = failures.map((f) => f.rule);

  if (rules.some((r) => r === "Product visible")) {
    plans.push({
      strategy: "smart_crop",
      reason: "Subject framing violates the contract safe area; re-derive the variant with content-aware cropping.",
      addressesRules: ["Product visible"],
    });
  }
  if (rules.includes("Maximum file size")) {
    plans.push({
      strategy: "q_auto",
      reason: "File size exceeds the contract maximum; re-encode with automatic quality/format optimization.",
      addressesRules: ["Maximum file size"],
    });
  }
  if (rules.includes("Allowed format")) {
    plans.push({
      strategy: "format_convert",
      reason: "Format is outside the contract allow-list; convert to an allowed format.",
      addressesRules: ["Allowed format"],
    });
  }
  if (rules.some((r) => r === "Clean background" || r === "No visible people")) {
    plans.push({
      strategy: "background_cleanup",
      reason: "Background violates the contract; normalize the background region.",
      addressesRules: rules.filter((r) => ["Clean background", "No visible people"].includes(r)),
    });
  }
  return plans.length > 0 ? plans : null;
}
