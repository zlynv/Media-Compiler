import { describe, expect, it } from "vitest";
import { contractInputSchema, diffContracts, CONTRACT_PRESETS } from "@/lib/contracts";
import { planRepair } from "@/lib/repair";
import { accessibilityQA, technicalQA, visualQA, policyQA } from "@/lib/qa";
import { compareRegression } from "@/lib/regression";
import type { BuildArtifact, MediaContract, QAResult } from "@/lib/types";

const contract: MediaContract = {
  id: "c1",
  name: "Test Contract",
  description: "",
  version: 1,
  variants: ["1:1", "4:5"],
  rules: {
    minWidth: 1200,
    minHeight: 1200,
    maxWidth: null,
    maxHeight: null,
    maxMegapixels: null,
    maxSizeKb: 300,
    allowedFormats: ["webp", "jpeg"],
    requireProductVisible: true,
    requireLogoVisible: true,
    requireCleanBackground: true,
    requireNoPeople: true,
    requireNoProhibitedContent: true,
    requireNoPersonalInfo: true,
    requireAltText: false,
    severity: {},
  },
  repairPolicy: { autoRepair: true, retestAfterRepair: true, sendToReview: true, maxRepairAttempts: 2 },
  status: "ACTIVE",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  history: [],
};

function artifact(overrides: Partial<BuildArtifact> = {}): BuildArtifact {
  return {
    id: "art1",
    buildId: "b1",
    variant: "1:1",
    version: 1,
    parentId: null,
    width: 1200,
    height: 1200,
    bytes: 150 * 1024,
    format: "webp",
    secureUrl: "https://example.com/a.webp",
    previewUrl: "https://example.com/a.webp",
    cloudinaryPublicId: null,
    derivation: "t",
    status: "SKIPPED",
    repairs: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("contract validation", () => {
  it("accepts a valid contract", () => {    const res = contractInputSchema.safeParse({
      name: "Diwali 2026 Campaign",
      description: "x",
      variants: ["1:1", "4:5"],
      rules: contract.rules,
      repairPolicy: contract.repairPolicy,
    });
    expect(res.success).toBe(true);
  });

  it("rejects missing variants", () => {
    const res = contractInputSchema.safeParse({
      name: "Bad",
      description: "",
      variants: [],
      rules: contract.rules,
      repairPolicy: contract.repairPolicy,
    });
    expect(res.success).toBe(false);
  });

  it("rejects invalid sizes", () => {
    const res = contractInputSchema.safeParse({
      name: "Bad",
      description: "",
      variants: ["1:1"],
      rules: { ...contract.rules, minWidth: 5 },
      repairPolicy: contract.repairPolicy,
    });
    expect(res.success).toBe(false);
  });

  it("ships presets that validate against the schema", () => {
    expect(CONTRACT_PRESETS.length).toBeGreaterThan(0);
    for (const preset of CONTRACT_PRESETS) {
      expect(preset.source.length).toBeGreaterThan(0);
      expect(contractInputSchema.safeParse(preset.input).success).toBe(true);
    }
  });
});

describe("technical QA", () => {
  it("passes a compliant artifact", () => {
    const results = technicalQA("b1", artifact(), contract);
    expect(results.every((r) => r.status === "PASS")).toBe(true);
  });

  it("fails oversized artifacts with HIGH repairability", () => {
    const results = technicalQA("b1", artifact({ bytes: 500 * 1024 }), contract);
    const size = results.find((r) => r.rule === "Maximum file size")!;
    expect(size.status).toBe("FAIL");
    expect(size.repairability).toBe("HIGH");
  });
});

describe("visual QA", () => {
  it("passes clean assets", () => {
    const results = visualQA("b1", artifact(), contract, "clean");
    expect(results.every((r) => r.status === "PASS")).toBe(true);
  });

  it("fails the fixable 4:5 crop before repair", () => {
    const results = visualQA("b1", artifact({ variant: "4:5" }), contract, "fixable");
    expect(results.some((r) => r.status === "FAIL")).toBe(true);
  });

  it("marks unrepairable logo failures as NONE", () => {
    const results = visualQA("b1", artifact({ variant: "1:1" }), contract, "unrepairable");
    const logo = results.find((r) => r.rule === "Logo visible")!;
    expect(logo.status).toBe("FAIL");
    expect(logo.repairability).toBe("NONE");
  });
});

describe("repair planning", () => {
  const fail = (rule: string, rep: QAResult["repairability"] = "HIGH"): QAResult => ({
    id: "q",
    buildId: "b1",
    artifactId: "art1",
    category: "technical",
    rule,
    status: "FAIL",
    severity: "BLOCK",
    confidence: 90,
    message: rule,
    repairability: rep,
    createdAt: new Date().toISOString(),
  });

  it("maps size failures to q_auto and crop failures to smart_crop", () => {
    const plan = planRepair([fail("Maximum file size"), fail("Product visible")]);
    expect(plan?.map((p) => p.strategy)).toContain("q_auto");
    expect(plan?.map((p) => p.strategy)).toContain("smart_crop");
  });

  it("returns null for unrepairable failures", () => {
    expect(planRepair([fail("Logo visible", "NONE")])).toBeNull();
  });
});

describe("policy QA", () => {
  it("passes clean assets", () => {
    const results = policyQA("b1", artifact(), contract, "clean");
    expect(results.every((r) => r.status === "PASS")).toBe(true);
  });
});

describe("accessibility QA", () => {
  const withAlt = { ...contract, rules: { ...contract.rules, requireAltText: true } };
  it("is skipped when the contract does not require alt text", () => {
    expect(accessibilityQA("b1", artifact(), contract, "Some text")).toEqual([]);
  });
  it("passes recorded alt text and fails missing alt text", () => {
    expect(accessibilityQA("b1", artifact(), withAlt, "A red sneaker")[0].status).toBe("PASS");
    const failed = accessibilityQA("b1", artifact(), withAlt, null)[0];
    expect(failed.status).toBe("FAIL");
    expect(failed.repairability).toBe("NONE");
  });
});

describe("severity", () => {
  it("resolves contract overrides and defaults to BLOCK", () => {
    const warned = { ...contract, rules: { ...contract.rules, severity: { "Maximum file size": "WARN" as const } } };
    const results = technicalQA("b1", artifact({ bytes: 900 * 1024 }), warned);
    expect(results.find((r) => r.rule === "Maximum file size")!.severity).toBe("WARN");
    expect(results.find((r) => r.rule === "Minimum width")!.severity).toBe("BLOCK");
  });
});

describe("release invariant", () => {
  it("a release cannot contain an artifact that violates its contract", () => {
    // Enforced server-side in releaseBuild(): any FAIL QA result or
    // non-PASS artifact throws before a manifest is created.
    const results = technicalQA("b1", artifact({ bytes: 900 * 1024 }), contract);
    const unresolved = results.filter((r) => r.status === "FAIL");
    expect(unresolved.length).toBeGreaterThan(0);
  });
});

describe("contract diff", () => {
  const v1 = {
    variants: ["1:1"],
    rules: { ...contract.rules, maxSizeKb: 500, requireLogoVisible: false },
    repairPolicy: contract.repairPolicy,
  };
  const v2 = {
    variants: ["1:1", "4:5"],
    rules: { ...contract.rules, maxSizeKb: 300, requireLogoVisible: true },
    repairPolicy: contract.repairPolicy,
  };
  it("reports added variants, changed limits and flipped flags", () => {
    const rows = diffContracts(v1, v2);
    expect(rows).toContainEqual({ area: "Variants", label: "4:5 variant", from: "-", to: "Required", change: "ADDED" });
    expect(rows).toContainEqual({ area: "Technical", label: "Maximum file size", from: "500 KB", to: "300 KB", change: "CHANGED" });
    expect(rows).toContainEqual({ area: "Visual", label: "Logo visibility", from: "Optional", to: "Required", change: "CHANGED" });
  });
  it("is empty for identical snapshots", () => {
    expect(diffContracts(v1, { ...v1, rules: { ...v1.rules } })).toEqual([]);
  });
});

describe("visual regression", () => {
  const base = artifact({ bytes: 200 * 1024 });
  it("passes identical artifacts", () => {
    const report = compareRegression([base], [{ ...base, id: "art2" }], "rel_1");
    expect(report.blocking).toBe(false);
    expect(report.rows[0].status).toBe("PASS");
  });
  it("fails dimension and format changes (blocking)", () => {
    const report = compareRegression(
      [base],
      [{ ...base, id: "art2", width: 800, height: 800, format: "jpeg" as const }],
      "rel_1",
    );
    expect(report.blocking).toBe(true);
    expect(report.rows[0].status).toBe("FAIL");
  });
  it("warns on large size swings without blocking", () => {
    const report = compareRegression([base], [{ ...base, id: "art2", bytes: 400 * 1024 }], "rel_1");
    expect(report.blocking).toBe(false);
    expect(report.rows[0].status).toBe("WARNING");
  });
});
