import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  Build,
  BuildArtifact,
  BuildEvent,
  MediaContract,
  QAResult,
  ReleaseManifest,
  RepairAction,
  ReviewItem,
  SourceAsset,
} from "./types";

export interface DbShape {
  contracts: MediaContract[];
  assets: SourceAsset[];
  builds: Build[];
  artifacts: BuildArtifact[];
  qaResults: QAResult[];
  repairs: RepairAction[];
  reviews: ReviewItem[];
  releases: ReleaseManifest[];
  events: BuildEvent[];
  buildSeq: number;
}

const DB_PATH_DEFAULT = path.join(process.cwd(), "data", "db.json");
// Overridable for tests (MC_DB_PATH) so engine tests never touch the dev database.
const dbPath = () => process.env.MC_DB_PATH ?? DB_PATH_DEFAULT;

let memory: DbShape | null = null;

/** Test-only: drop the cached database so the next access reseeds. */
export function resetStore(): void {
  memory = null;
}

function emptyDb(): DbShape {
  return {
    contracts: [],
    assets: [],
    builds: [],
    artifacts: [],
    qaResults: [],
    repairs: [],
    reviews: [],
    releases: [],
    events: [],
    buildSeq: 1042,
  };
}

async function loadFromDisk(): Promise<DbShape | null> {
  try {
    const raw = await fs.readFile(dbPath(), "utf-8");
    return JSON.parse(raw) as DbShape;
  } catch {
    return null;
  }
}

async function saveToDisk(db: DbShape): Promise<void> {
  try {
    await fs.mkdir(path.dirname(dbPath()), { recursive: true });
    await fs.writeFile(dbPath(), JSON.stringify(db, null, 2), "utf-8");
  } catch {
    // Disk persistence is best-effort (e.g. read-only runtimes); memory still works.
  }
}

export async function db(): Promise<DbShape> {
  if (!memory) {
    memory = (await loadFromDisk()) ?? emptyDb();
    if (memory.contracts.length === 0 && memory.builds.length === 0) {
      seed(memory);
      await saveToDisk(memory);
    }
  }
  return memory;
}

export async function persist(): Promise<void> {
  if (memory) await saveToDisk(memory);
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function isoNow(): string {
  return new Date().toISOString();
}

function seed(db: DbShape): void {
  const now = isoNow();
  // NOTE: maxSizeKb values are set against REAL measured baselines: the
  // seeded 16:9 q_auto derivation measures ~296 KB, so the Diwali limit is
  // 500 KB (comfortable margin), while the unoptimized 4:5 (q_100 JPEG,
  // ~1.3 MB) genuinely violates it until q_auto repair (~212 KB).
  db.contracts.push(
    {
      id: "contract_diwali_2026",
      name: "Diwali 2026 Campaign",
      description: "Production requirements for campaign assets",
      version: 3,
      history: [],
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
        requireAltText: true,
        severity: {},
      },
      repairPolicy: { autoRepair: true, retestAfterRepair: true, sendToReview: true, maxRepairAttempts: 2 },
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "contract_marketplace",
      name: "Marketplace Product Listing",
      description: "Catalog requirements for marketplace product images",
      version: 1,
      history: [],
      variants: ["1:1", "4:5"],
      rules: {
        minWidth: 1000,
        minHeight: 1000,
        maxWidth: null,
        maxHeight: null,
        maxMegapixels: null,
        maxSizeKb: 500,
        allowedFormats: ["webp", "jpeg"],
        requireProductVisible: true,
        requireLogoVisible: false,
        requireCleanBackground: true,
        requireNoPeople: false,
        requireNoProhibitedContent: true,
        requireNoPersonalInfo: true,
        requireAltText: true,
        severity: {},
      },
      repairPolicy: { autoRepair: true, retestAfterRepair: true, sendToReview: true, maxRepairAttempts: 2 },
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "contract_social",
      name: "Social Campaign",
      description: "Organic and paid social asset requirements",
      version: 2,
      history: [],
      variants: ["1:1", "16:9"],
      rules: {
        minWidth: 1080,
        minHeight: 1000,
        maxWidth: null,
        maxHeight: null,
        maxMegapixels: null,
        maxSizeKb: 500,
        allowedFormats: ["webp", "avif"],
        requireProductVisible: true,
        requireLogoVisible: true,
        requireCleanBackground: false,
        requireNoPeople: false,
        requireNoProhibitedContent: true,
        requireNoPersonalInfo: true,
        requireAltText: false,
        severity: {},
      },
      repairPolicy: { autoRepair: true, retestAfterRepair: true, sendToReview: true, maxRepairAttempts: 2 },
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    },
  );

  // Real Cloudinary-hosted demo sources (uploaded via scripts/seed-cloudinary.mjs).
  const cl = "https://res.cloudinary.com/lz92ewbz/image/upload";
  db.assets.push(
    {
      id: "asset_clean",
      name: "product-studio-clean.jpg",
      cloudinaryPublicId: "media-compiler/product-studio-clean",
      secureUrl: `${cl}/v1791013975/media-compiler/product-studio-clean.jpg`,
      previewUrl: `${cl}/c_fill,w_960/media-compiler/product-studio-clean.jpg`,
      width: 1920,
      height: 1280,
      bytes: 326900,
      format: "jpg",
      altText: "Studio product photograph on a clean background",
      demoProfile: "clean",
      createdAt: now,
    },
    {
      id: "asset_fixable",
      name: "product-master.jpg",
      cloudinaryPublicId: "media-compiler/product-master",
      secureUrl: `${cl}/v1791013977/media-compiler/product-master.jpg`,
      previewUrl: `${cl}/c_fill,w_960/media-compiler/product-master.jpg`,
      width: 1920,
      height: 1280,
      bytes: 321633,
      format: "jpg",
      altText: "Campaign hero product photograph",
      demoProfile: "fixable",
      createdAt: now,
    },
    {
      id: "asset_unrepairable",
      name: "poster-7.jpg",
      cloudinaryPublicId: "media-compiler/poster-7",
      secureUrl: `${cl}/v1791013979/media-compiler/poster-7.jpg`,
      previewUrl: `${cl}/c_fill,w_960/media-compiler/poster-7.jpg`,
      width: 1600,
      height: 1200,
      bytes: 67586,
      format: "jpg",
      altText: "Promotional poster photograph",
      demoProfile: "unrepairable",
      createdAt: now,
    },
  );

  db.buildSeq = 1042;
}
