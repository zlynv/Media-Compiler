import { z } from "zod";

export const variantSchema = z.enum(["1:1", "4:5", "16:9"]);

export const allowedFormatSchema = z.enum(["webp", "avif", "jpeg"]);

export const severitySchema = z.enum(["BLOCK", "WARN", "INFO"]);

const nullableMax = z
  .union([z.coerce.number().int().min(1).max(30000), z.nan(), z.null(), z.undefined(), z.literal("")])
  .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null));

export const contractRulesSchema = z.object({
  minWidth: z.coerce.number().int().min(64).max(12000),
  minHeight: z.coerce.number().int().min(64).max(12000),
  maxWidth: nullableMax,
  maxHeight: nullableMax,
  maxMegapixels: z
    .union([z.coerce.number().min(0.1).max(200), z.nan(), z.null(), z.undefined(), z.literal("")])
    .transform((v) => (typeof v === "number" && Number.isFinite(v) ? v : null)),
  maxSizeKb: z.coerce.number().int().min(10).max(20000),
  allowedFormats: z.array(allowedFormatSchema).min(1, "Select at least one format"),
  requireProductVisible: z.boolean(),
  requireLogoVisible: z.boolean(),
  requireCleanBackground: z.boolean(),
  requireNoPeople: z.boolean(),
  requireNoProhibitedContent: z.boolean(),
  requireNoPersonalInfo: z.boolean(),
  requireAltText: z.boolean(),
  severity: z.record(z.string(), severitySchema).default({}),
});

export const repairPolicySchema = z.object({
  autoRepair: z.boolean(),
  retestAfterRepair: z.boolean(),
  sendToReview: z.boolean(),
  maxRepairAttempts: z.coerce.number().int().min(1).max(5),
});

export const contractInputSchema = z.object({
  name: z.string().trim().min(3, "Name must be at least 3 characters").max(80),
  description: z.string().trim().max(500).default(""),
  variants: z.array(variantSchema).min(1, "Select at least one variant"),
  rules: contractRulesSchema,
  repairPolicy: repairPolicySchema,
});

export type ContractInput = z.infer<typeof contractInputSchema>;

/** Form values = schema INPUT type (z.coerce fields accept unknown, defaults may be absent). */
export type ContractFormValues = z.input<typeof contractInputSchema>;

export type ContractDiffChange = "ADDED" | "REMOVED" | "CHANGED";

export interface ContractDiffRow {
  area: string;
  label: string;
  from: string;
  to: string;
  change: ContractDiffChange;
}

interface VersionLike {
  variants: string[];
  rules: {
    minWidth: number;
    minHeight: number;
    maxWidth: number | null;
    maxHeight: number | null;
    maxMegapixels: number | null;
    maxSizeKb: number;
    allowedFormats: string[];
    requireProductVisible: boolean;
    requireLogoVisible: boolean;
    requireCleanBackground: boolean;
    requireNoPeople: boolean;
    requireNoProhibitedContent: boolean;
    requireNoPersonalInfo: boolean;
    requireAltText: boolean;
  };
  repairPolicy: { autoRepair: boolean; retestAfterRepair: boolean; sendToReview: boolean };
}

const req = (v: boolean) => (v ? "Required" : "Optional");

function boolRow(area: string, label: string, a: boolean, b: boolean): ContractDiffRow | null {
  if (a === b) return null;
  return { area, label, from: req(a), to: req(b), change: "CHANGED" };
}

/** GitHub-style version diff over two contract snapshots. Null rows omitted. */
export function diffContracts(a: VersionLike, b: VersionLike): ContractDiffRow[] {
  const rows: (ContractDiffRow | null)[] = [];

  for (const v of b.variants.filter((x) => !a.variants.includes(x))) {
    rows.push({ area: "Variants", label: `${v} variant`, from: "-", to: "Required", change: "ADDED" });
  }
  for (const v of a.variants.filter((x) => !b.variants.includes(x))) {
    rows.push({ area: "Variants", label: `${v} variant`, from: "Required", to: "-", change: "REMOVED" });
  }

  const nums: [string, string, number, number, (n: number) => string][] = [
    ["Technical", "Minimum width", a.rules.minWidth, b.rules.minWidth, (n) => `${n}px`],
    ["Technical", "Minimum height", a.rules.minHeight, b.rules.minHeight, (n) => `${n}px`],
    ["Technical", "Maximum file size", a.rules.maxSizeKb, b.rules.maxSizeKb, (n) => `${n} KB`],
  ];
  for (const [area, label, x, y, fmt] of nums) {
    if (x !== y) rows.push({ area, label, from: fmt(x), to: fmt(y), change: "CHANGED" });
  }

  const optNums: [string, string, number | null, number | null, (n: number) => string][] = [
    ["Technical", "Maximum width", a.rules.maxWidth, b.rules.maxWidth, (n) => `${n}px`],
    ["Technical", "Maximum height", a.rules.maxHeight, b.rules.maxHeight, (n) => `${n}px`],
    ["Technical", "Maximum megapixels", a.rules.maxMegapixels, b.rules.maxMegapixels, (n) => `${n} MP`],
  ];
  for (const [area, label, x, y, fmt] of optNums) {
    if (x !== y) rows.push({ area, label, from: x == null ? "-" : fmt(x), to: y == null ? "-" : fmt(y), change: "CHANGED" });
  }

  const fa = [...a.rules.allowedFormats].sort().join(" / ").toUpperCase();
  const fb = [...b.rules.allowedFormats].sort().join(" / ").toUpperCase();
  if (fa !== fb) rows.push({ area: "Technical", label: "Allowed formats", from: fa, to: fb, change: "CHANGED" });

  rows.push(
    boolRow("Visual", "Product visibility", a.rules.requireProductVisible, b.rules.requireProductVisible),
    boolRow("Visual", "Logo visibility", a.rules.requireLogoVisible, b.rules.requireLogoVisible),
    boolRow("Visual", "Clean background", a.rules.requireCleanBackground, b.rules.requireCleanBackground),
    boolRow("Visual", "No visible people", a.rules.requireNoPeople, b.rules.requireNoPeople),
    boolRow("Policy", "No prohibited content", a.rules.requireNoProhibitedContent, b.rules.requireNoProhibitedContent),
    boolRow("Policy", "No personal information", a.rules.requireNoPersonalInfo, b.rules.requireNoPersonalInfo),
    boolRow("Accessibility", "Alt text required", a.rules.requireAltText, b.rules.requireAltText),
    boolRow("Repair", "Auto-repair when safe", a.repairPolicy.autoRepair, b.repairPolicy.autoRepair),
    boolRow("Repair", "Re-test repaired assets", a.repairPolicy.retestAfterRepair, b.repairPolicy.retestAfterRepair),
    boolRow("Repair", "Send failures to review", a.repairPolicy.sendToReview, b.repairPolicy.sendToReview),
  );

  return rows.filter((r): r is ContractDiffRow => r !== null);
}

export const DEFAULT_CONTRACT_INPUT: ContractInput = {
  name: "",
  description: "",
  variants: ["1:1", "4:5", "16:9"],
  rules: {
    minWidth: 1200,
    minHeight: 1000,
    maxWidth: null,
    maxHeight: null,
    maxMegapixels: null,
    maxSizeKb: 500,
    allowedFormats: ["webp", "avif", "jpeg"],
    requireProductVisible: true,
    requireLogoVisible: true,
    requireCleanBackground: true,
    requireNoPeople: true,
    requireNoProhibitedContent: true,
    requireNoPersonalInfo: true,
    requireAltText: false,
    severity: {},
  },
  repairPolicy: {
    autoRepair: true,
    retestAfterRepair: true,
    sendToReview: true,
    maxRepairAttempts: 2,
  },
};

/** One-click contract presets (documented sources, no fake compliance claims). */
export const CONTRACT_PRESETS: { name: string; source: string; input: ContractInput }[] = [
  {
    name: "E-commerce Product",
    source: "Marketplace catalog conventions (clean background, product prominence)",
    input: {
      ...DEFAULT_CONTRACT_INPUT,
      name: "Marketplace Product Listing",
      description: "Catalog requirements for marketplace product images",
      variants: ["1:1", "4:5"],
      rules: {
        ...DEFAULT_CONTRACT_INPUT.rules,
        minWidth: 1000,
        minHeight: 1000,
        maxSizeKb: 500,
        allowedFormats: ["webp", "jpeg"],
        requireLogoVisible: false,
        requireNoPeople: false,
        requireAltText: true,
      },
    },
  },
  {
    name: "Google Shopping",
    source: "Google Merchant Center image guidance (unobstructed product, no promotional overlays, accepted formats)",
    input: {
      ...DEFAULT_CONTRACT_INPUT,
      name: "Google Shopping Feed",
      description: "Feed requirements: unobstructed product, no promotional text or watermarks",
      variants: ["1:1"],
      rules: {
        ...DEFAULT_CONTRACT_INPUT.rules,
        minWidth: 500,
        minHeight: 500,
        maxSizeKb: 500,
        allowedFormats: ["webp", "jpeg"],
        requireCleanBackground: true,
        requireNoPeople: false,
        requireAltText: true,
      },
    },
  },
  {
    name: "Social Campaign",
    source: "Paid/organic social conventions (multi-ratio, brand presence)",
    input: {
      ...DEFAULT_CONTRACT_INPUT,
      name: "Social Campaign",
      description: "Organic and paid social asset requirements",
      variants: ["1:1", "16:9"],
      rules: {
        ...DEFAULT_CONTRACT_INPUT.rules,
        minWidth: 1080,
        minHeight: 1000,
        maxSizeKb: 500,
        allowedFormats: ["webp", "avif"],
        requireCleanBackground: false,
        requireNoPeople: false,
      },
    },
  },
];

export const assetInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  secureUrl: z.string().url(),
  previewUrl: z.string().url().optional(),
  cloudinaryPublicId: z.string().max(300).nullable().optional(),
  width: z.coerce.number().int().min(1).max(30000),
  height: z.coerce.number().int().min(1).max(30000),
  bytes: z.coerce.number().int().min(1),
  format: z.string().trim().min(1).max(20),
  altText: z.string().trim().max(300).nullable().optional(),
  contractId: z.string().trim().min(1).optional(),
  demoProfile: z.enum(["clean", "fixable", "unrepairable"]).optional(),
});

export type AssetInput = z.infer<typeof assetInputSchema>;
