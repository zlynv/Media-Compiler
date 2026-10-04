import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.MC_STEP_MS = "5";
process.env.MC_DB_PATH = path.join(__dirname, "..", "..", "test-db.json");
// Dummy Cloudinary config so artifactUrl builds the real transformation-URL
// branch offline (pure string building, no network); measurement stays mocked.
process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";

vi.mock("@/lib/cloudinary", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/cloudinary")>();
  return {
    ...mod,
    // Deterministic stand-in for HEAD measurement: unoptimized derivations
    // genuinely exceed the seeded 500 KB limit, optimized ones pass.
    measureDerived: async (url: string) => {
      if ((globalThis as Record<string, unknown>).__CLOUDINARY_DOWN) return null;
      if (url.includes("q_100")) return { bytes: 1_300_000, format: "jpeg" as const };
      return { bytes: 200_000, format: "webp" as const };
    },
    artifactUrl: (...args: Parameters<typeof mod.artifactUrl>) => {
      if ((globalThis as Record<string, unknown>).__CLOUDINARY_DOWN) {
        throw new Error("cloud down");
      }
      return mod.artifactUrl(...args);
    },
  };
});

import { compile, getRegression, releaseBuild, rejectRegressedRepairs, repairBuild, retestBuild, rollbackRelease } from "@/lib/engine";
import { db, resetStore } from "@/lib/store";
import type { Build } from "@/lib/types";

async function waitForTerminal(buildId: string): Promise<Build> {
  for (let i = 0; i < 200; i++) {
    const store = await db();
    const build = store.builds.find((b) => b.id === buildId);
    if (build && ["PASSED", "REVIEW_REQUIRED", "FAILED", "RELEASED"].includes(build.status)) {
      return build;
    }
    await new Promise((r) => setTimeout(r, 25));
  }
  throw new Error("build did not reach a terminal state");
}

beforeEach(() => {
  // Fresh reseeded database for every test - delete the temp file first.
  try {
    fs.unlinkSync(process.env.MC_DB_PATH!);
  } catch {
    /* absent is fine */
  }
  resetStore();
  delete (globalThis as Record<string, unknown>).__CLOUDINARY_DOWN;
});

describe("compile pipeline", () => {
  it("repairs the fixable 4:5 and regenerates the artifact", async () => {
    const build = await compile("asset_fixable", "contract_diwali_2026");
    // Build pins the contract version it compiled against.
    expect(build.contractVersion).toBe(3);
    expect(build.contractSnapshot.rules.maxSizeKb).toBe(500);

    const done = await waitForTerminal(build.id);
    expect(done.status).toBe("PASSED");

    const store = await db();
    const fourFives = store.artifacts.filter((a) => a.buildId === build.id && a.variant === "4:5");
    expect(fourFives.length).toBe(2); // v1 failed, repair created v2
    const v1 = fourFives.find((a) => a.version === 1)!;
    const fourFive = fourFives.find((a) => a.version === 2)!;
    expect(v1.status).toBe("FAIL"); // history preserved
    expect(fourFive.parentId).toBe(v1.id); // lineage linked
    // Repair actually ran and re-derived the artifact through q_auto.
    expect(fourFive.repairs).toContain("smart_crop");
    expect(fourFive.repairs).toContain("q_auto");
    expect(fourFive.derivation).toContain("q_auto");
    expect(fourFive.bytes).toBe(200_000);
    expect(store.repairs.filter((r) => r.buildId === build.id).length).toBeGreaterThan(0);
  });

  it("sends the unrepairable asset to human review and blocks release", async () => {
    const build = await compile("asset_unrepairable", "contract_diwali_2026");
    const done = await waitForTerminal(build.id);
    expect(done.status).toBe("REVIEW_REQUIRED");

    const store = await db();
    expect(store.reviews.some((r) => r.buildId === build.id && r.decision === "PENDING")).toBe(true);
    await expect(releaseBuild(build.id)).rejects.toThrow(/Release blocked/);
  });

  it("keeps release blocked while failures remain and releases once passing", async () => {
    const store = await db();
    const contract = store.contracts.find((c) => c.id === "contract_diwali_2026")!;
    contract.repairPolicy.autoRepair = false;
    await compile("asset_fixable", "contract_diwali_2026").then((b) => waitForTerminal(b.id));
    const failed = (await db()).builds[0];
    expect(failed.status).toBe("FAILED");
    await expect(releaseBuild(failed.id)).rejects.toThrow(/Release blocked/);

    // Manual repair path re-derives and passes; only then is release allowed.
    await repairBuild(failed.id);
    const repaired = await waitForTerminal(failed.id);
    expect(repaired.status).toBe("PASSED");
    const manifest = await releaseBuild(failed.id);
    expect(manifest.unresolvedFailures).toBe(0);
    // Release is idempotent - the same verified manifest is returned.
    const again = await releaseBuild(failed.id);
    expect(again.releaseId).toBe(manifest.releaseId);
  });

  it("retest evaluates current artifacts and old builds keep their snapshot", async () => {
    const build = await compile("asset_clean", "contract_diwali_2026");
    const done = await waitForTerminal(build.id);
    expect(done.status).toBe("PASSED");

    // Edit the live contract into something the build could never satisfy.
    const store = await db();
    const live = store.contracts.find((c) => c.id === "contract_diwali_2026")!;
    live.version += 1;
    live.rules.maxSizeKb = 1;

    // Re-test still uses the pinned snapshot - the build stays green.
    const retested = await retestBuild(build.id);
    expect(retested.status).toBe("PASSED");
    const after = (await db()).builds.find((b) => b.id === build.id)!;
    expect(after.contractVersion).toBe(3);
    expect(after.contractSnapshot.rules.maxSizeKb).toBe(500);
  });

  it("moves the build to FAILED when Cloudinary operations fail", async () => {
    (globalThis as Record<string, unknown>).__CLOUDINARY_DOWN = true;
    const build = await compile("asset_clean", "contract_diwali_2026");
    const done = await waitForTerminal(build.id);
    expect(done.status).toBe("FAILED");
  });

  it("ships WARN-severity failures visibly without blocking release", async () => {
    const store = await db();
    const contract = store.contracts.find((c) => c.id === "contract_diwali_2026")!;
    contract.rules.maxSizeKb = 10; // everything exceeds it…
    contract.rules.severity = { "Maximum file size": "WARN" }; // …but only as a warning
    const build = await compile("asset_clean", "contract_diwali_2026");
    const done = await waitForTerminal(build.id);
    expect(done.status).toBe("PASSED");
    const manifest = await releaseBuild(build.id);
    expect(manifest.unresolvedFailures).toBe(0);
    expect(manifest.warnings.some((w) => w.includes("Maximum file size"))).toBe(true);
  });

  it("enforces the repair budget instead of looping forever", async () => {
    const store = await db();
    const contract = store.contracts.find((c) => c.id === "contract_diwali_2026")!;
    contract.repairPolicy.autoRepair = false;
    contract.repairPolicy.maxRepairAttempts = 0;
    const build = await compile("asset_fixable", "contract_diwali_2026");
    await waitForTerminal(build.id);
    await expect(repairBuild(build.id)).rejects.toThrow(/budget exhausted/);
  });

  it("rejects repairs that fix the target but break another blocking rule", async () => {
    const build = await compile("asset_clean", "contract_diwali_2026");
    await waitForTerminal(build.id);
    const store = await db();
    const art = store.artifacts.find((a) => a.buildId === build.id)!;
    const repId = "rep_test";
    store.repairs.push({
      id: repId, buildId: build.id, artifactId: art.id,
      strategy: "q_auto", reason: "test", result: "APPLIED",
      createdAt: new Date().toISOString(),
    });
    const fresh = [
      { ...store.qaResults.find((q) => q.artifactId === art.id)!, id: "qa_new", rule: "Logo visible", status: "FAIL" as const },
    ];
    const regressed = await rejectRegressedRepairs(build.id, art.variant, ["Maximum file size"], fresh, art.id);
    expect(regressed).toEqual(["Logo visible"]);
    expect(store.repairs.find((r) => r.id === repId)!.result).toBe("REJECTED");
  });

  it("releases only the latest artifact versions", async () => {
    const build = await compile("asset_fixable", "contract_diwali_2026");
    await waitForTerminal(build.id);
    const manifest = await releaseBuild(build.id);
    const fourFive = manifest.artifacts.find((a) => a.variant === "4:5")!;
    // The released 4:5 is the repaired v2, not the failed v1.
    expect(manifest.artifacts.filter((a) => a.variant === "4:5").length).toBe(1);
    expect(fourFive.repairs).toContain("q_auto");
    expect(fourFive.bytes).toBe(200_000);
  });

  it("blocks release on visual regression and supports auditable rollback", async () => {
    const first = await compile("asset_clean", "contract_diwali_2026");
    await waitForTerminal(first.id);
    const rel1 = await releaseBuild(first.id);
    expect(rel1.status).toBe("LIVE");

    // A second identical build has no regression and releases cleanly.
    const second = await compile("asset_clean", "contract_diwali_2026");
    await waitForTerminal(second.id);
    const report = await getRegression(second.id);
    expect(report?.baselineRef).toBe(rel1.releaseId);
    expect(report?.blocking).toBe(false);
    const rel2 = await releaseBuild(second.id);
    expect(rel2.status).toBe("LIVE");
    expect((await db()).releases.find((r) => r.releaseId === rel1.releaseId)!.status).toBe("SUPERSEDED");

    // Simulate a regressed candidate (dimensions changed) → gate refuses.
    const third = await compile("asset_clean", "contract_diwali_2026");
    await waitForTerminal(third.id);
    const store = await db();
    const oneByOne = store.artifacts.find((a) => a.buildId === third.id && a.variant === "1:1")!;
    oneByOne.width = 800;
    oneByOne.height = 800;
    await expect(releaseBuild(third.id)).rejects.toThrow(/visual regression/);

    // Rollback re-publishes the old release as a new auditable record.
    const rolled = await rollbackRelease(rel1.releaseId);
    expect(rolled.rollbackOf).toBe(rel1.releaseId);
    expect(rolled.status).toBe("LIVE");
    expect(rolled.artifacts.length).toBe(rel1.artifacts.length);
    expect((await db()).releases.find((r) => r.releaseId === rel2.releaseId)!.status).toBe("SUPERSEDED");
  });
});
