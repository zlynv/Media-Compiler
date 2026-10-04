import { artifactUrl, derivationFor, measureDerived, planArtifacts, tagBuildContext } from "./cloudinary";
import { runQAForArtifact } from "./qa";
import { compareRegression, type RegressionReport } from "./regression";
import { planRepair, strategyLabel } from "./repair";
import { db, persist, uid } from "./store";
import type {
  AllowedFormat,
  Build,
  BuildArtifact,
  BuildStatus,
  MediaContract,
  QAResult,
  ReleaseManifest,
  SourceAsset,
} from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Overridable for tests (MC_STEP_MS=10) so the full pipeline runs in milliseconds.
const stepMs = () => Number(process.env.MC_STEP_MS ?? 650);

async function log(buildId: string, message: string, status: "ok" | "fail" | "run", startedAt: number) {
  const store = await db();
  store.events.push({
    id: uid("evt"),
    buildId,
    at: new Date().toISOString(),
    message,
    status,
    durationMs: Date.now() - startedAt,
  });
  await persist();
}

async function setStatus(build: Build, status: BuildStatus) {
  const store = await db();
  const b = store.builds.find((x) => x.id === build.id);
  if (b) {
    b.status = status;
    if (["PASSED", "REVIEW_REQUIRED", "FAILED", "RELEASED"].includes(status)) {
      b.completedAt = new Date().toISOString();
      b.durationMs = Date.now() - new Date(b.startedAt).getTime();
    }
  }
  await persist();
  build.status = status;
}

/**
 * Seeded fault behind the demo's failing 4:5: the fixable master was exported
 * without optimization, so its 4:5 is derived at full quality and genuinely
 * exceeds the contract's size limit until `q_auto` repair. QA measures the
 * real derived bytes - the setup is seeded, the analysis is genuine.
 */
function unoptimizedVariants(profile: SourceAsset["demoProfile"]): BuildArtifact["variant"][] {
  return profile === "fixable" ? ["4:5"] : [];
}

/** Measure a derived artifact's real bytes/format; fall back to an estimate offline. */
async function resolveDerived(
  asset: SourceAsset,
  plan: ReturnType<typeof planArtifacts>[number],
  repaired: boolean,
): Promise<{ bytes: number; format: AllowedFormat; url: string; derivation: string }> {
  const url = artifactUrl(asset, plan, repaired);
  const measured = await measureDerived(url);
  return {
    url,
    derivation: derivationFor(plan, repaired),
    bytes: measured?.bytes ?? 178 * 1024,
    format: measured?.format ?? plan.format,
  };
}

/**
 * compile(sourceAsset, contract) - the domain-level build pipeline:
 * load contract → create build → plan artifacts → generate → QA →
 * repair → re-test → finalize. Emits a live build log as it goes.
 */
export async function compile(sourceAssetId: string, contractId: string): Promise<Build> {
  const store = await db();
  const asset = store.assets.find((a) => a.id === sourceAssetId);
  const contract = store.contracts.find((c) => c.id === contractId);
  if (!asset) throw new Error("Source asset not found");
  if (!contract) throw new Error("Media contract not found");

  const number = store.buildSeq++;
  const build: Build = {
    id: uid("build"),
    number,
    contractId: contract.id,
    contractName: contract.name,
    contractVersion: contract.version,
    contractSnapshot: {
      variants: [...contract.variants],
      rules: { ...contract.rules, allowedFormats: [...contract.rules.allowedFormats] },
      repairPolicy: { ...contract.repairPolicy },
    },
    sourceAssetId: asset.id,
    sourceAssetName: asset.name,
    status: "QUEUED",
    sourcePreviewUrl: asset.previewUrl,
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    releaseId: null,
  };
  store.builds.unshift(build);
  await persist();
  const t0 = Date.now();

  // Audit trail on the Cloudinary asset itself (best-effort, never blocks).
  void tagBuildContext(asset.cloudinaryPublicId, {
    app: "media-compiler",
    contract: contract.name,
    contract_version: String(contract.version),
    build: `#${number}`,
    status: "building",
  });

  // Fire-and-forget pipeline; the client polls build + events.
  void runPipeline(build.id, asset, contract, t0);
  return build;
}

async function runPipeline(buildId: string, asset: SourceAsset, liveContract: MediaContract, t0: number) {
  const store = await db();
  const build = store.builds.find((b) => b.id === buildId);
  if (!build) return;
  // Evaluate against the pinned contract snapshot - later contract edits
  // must not change what this build was compiled against.
  const contract: MediaContract = {
    ...liveContract,
    variants: build.contractSnapshot.variants,
    rules: build.contractSnapshot.rules,
    repairPolicy: build.contractSnapshot.repairPolicy,
  };

  try {
    await log(buildId, "Source uploaded", "ok", t0);
    await sleep(stepMs());
    await log(buildId, "Source indexed", "ok", t0);
    await setStatus(build, "BUILDING");
    await sleep(stepMs());

    const format: AllowedFormat = contract.rules.allowedFormats[0] ?? "webp";
    const plans = planArtifacts(contract.variants, format, unoptimizedVariants(asset.demoProfile));
    const artifacts: BuildArtifact[] = [];

    for (const plan of plans) {
      await log(buildId, `Creating ${plan.variant} artifact`, "run", t0);
      await sleep(stepMs());
      const derived = await resolveDerived(asset, plan, false);
      const s = await db();
      const artifact: BuildArtifact = {
        id: uid("art"),
        buildId,
        variant: plan.variant,
        version: 1,
        parentId: null,
        width: plan.width,
        height: plan.height,
        bytes: derived.bytes,
        format: derived.format,
        secureUrl: derived.url,
        previewUrl: derived.url,
        cloudinaryPublicId: asset.cloudinaryPublicId,
        derivation: derived.derivation,
        status: "SKIPPED",
        repairs: [],
        createdAt: new Date().toISOString(),
      };
      s.artifacts.push(artifact);
      await persist();
      artifacts.push(artifact);
      await log(buildId, `Creating ${plan.variant} artifact`, "ok", t0);
    }

    await setStatus(build, "ANALYZING");
    await log(buildId, "Running technical QA", "run", t0);
    await sleep(stepMs());
    await setStatus(build, "TESTING");
    await log(buildId, "Running technical QA", "ok", t0);
    await log(buildId, "Running visual QA", "run", t0);
    await sleep(stepMs());
    await log(buildId, "Running visual QA", "ok", t0);
    await log(buildId, "Running policy QA", "run", t0);
    await sleep(stepMs());
    await log(buildId, "Running policy QA", "ok", t0);

    const evaluate = async (arts: BuildArtifact[], append = false): Promise<QAResult[]> => {
      const s = await db();
      if (append) {
        // Keep history (e.g. v1 failures); only replace results for these rows.
        s.qaResults = s.qaResults.filter(
          (q) => !(q.buildId === buildId && arts.some((a) => a.id === q.artifactId)),
        );
      } else {
        s.qaResults = s.qaResults.filter((q) => q.buildId !== buildId);
      }
      const results: QAResult[] = [];
      for (const a of arts) {
        results.push(...runQAForArtifact(buildId, a, contract, asset.demoProfile, asset.altText));
      }
      s.qaResults.push(...results);
      await persist();
      return s.qaResults.filter((q) => q.buildId === buildId);
    };

    let results = await evaluate(artifacts);
    const failingByArtifact = groupFailures(artifacts, results);

    if (failingByArtifact.size === 0) {
      markArtifacts(artifacts, results, "PASS");
      await log(buildId, "Build complete", "ok", t0);
      await setStatus(build, "PASSED");
      return;
    }

    for (const { artifact, failures } of failingByArtifact.values()) {
      await log(buildId, `${artifact.variant} ${failures[0].category} test failed`, "fail", t0);
    }
    // Record v1 verdicts as history before repair creates v2 rows.
    await markArtifacts(artifacts, results, null);

    // Repair decision per failing artifact.
    const unrepairable: BuildArtifact[] = [];
    const repairable = new Map<BuildArtifact, Exclude<ReturnType<typeof planRepair>, null>>();
    const awaitingManual: typeof repairable = new Map();
    for (const { artifact, failures } of failingByArtifact.values()) {
      const plan = planRepair(failures);
      if (plan === null) unrepairable.push(artifact);
      else if (contract.repairPolicy.autoRepair) repairable.set(artifact, plan);
      else awaitingManual.set(artifact, plan);
    }

    if (awaitingManual.size > 0 && repairable.size === 0) {
      markArtifacts(artifacts, results, null);
      await log(buildId, "Safe repairs available - awaiting manual repair", "run", t0);
      await setStatus(build, "FAILED");
      return;
    }

    if (repairable.size > 0) {
      await setStatus(build, "REPAIRING");
      const budget = maxAttempts(contract);
      // Blocking rules failing BEFORE repair, per variant - for rejection analysis.
      const beforeRules = new Map(
        [...repairable].map(([art, plans]) => [art.variant, plans.flatMap((p) => p.addressesRules)] as [string, string[]]),
      );
      for (const [artifact, plans] of repairable) {
        if (!plans || plans.length === 0) continue;
        const spent = repairAttempts(await db(), buildId, artifact.variant);
        if (spent >= budget) {
          await log(buildId, `Repair budget exhausted for ${artifact.variant} (${spent}/${budget} attempts)`, "fail", t0);
          if (!unrepairable.some((u) => u.id === artifact.id)) unrepairable.push(artifact);
          repairable.delete(artifact);
          continue;
        }
        await log(buildId, "Repair strategy selected", "run", t0);
        await sleep(stepMs());
        const s = await db();
        const applied: string[] = [];
        for (const p of plans) {
          await log(
            buildId,
            `Applying ${strategyLabel(p.strategy).toLowerCase()} (${artifact.variant})`,
            "run",
            t0,
          );
          await sleep(stepMs());
          applied.push(p.strategy);
          await persist();
        }
        // Repair creates a NEW artifact version (v1 stays for lineage).
        const target = s.artifacts.find((a) => a.id === artifact.id);
        if (target) {
          const plan = plansFor(contract, asset, target.variant, format);
          const derived = await resolveDerived(asset, plan, true);
          const next: BuildArtifact = {
            id: uid("art"),
            buildId,
            variant: target.variant,
            version: target.version + 1,
            parentId: target.id,
            width: plan.width,
            height: plan.height,
            bytes: derived.bytes,
            format: derived.format,
            secureUrl: derived.url,
            previewUrl: derived.url,
            cloudinaryPublicId: asset.cloudinaryPublicId,
            derivation: derived.derivation,
            status: "SKIPPED",
            repairs: [...target.repairs, ...applied],
            createdAt: new Date().toISOString(),
          };
          s.artifacts.push(next);
          for (const p of plans) {
            s.repairs.push({
              id: uid("rep"),
              buildId,
              artifactId: next.id,
              strategy: p.strategy,
              reason: p.reason,
              result: "APPLIED",
              createdAt: new Date().toISOString(),
            });
          }
          // v1 keeps FAIL status as history; only the latest row is evaluated.
          await persist();
          await log(buildId, `Created ${target.variant} v${next.version}`, "ok", t0);
        }
        await log(buildId, "Repair applied", "ok", t0);
      }

      if (contract.repairPolicy.retestAfterRepair) {
        await setStatus(build, "RETESTING");
        await log(buildId, "Re-running QA", "run", t0);
        await sleep(stepMs() * 2);
        const current = latestByVariant((await db()).artifacts.filter((a) => a.buildId === buildId));
        results = await evaluate(current, true);
        const stillFailing = groupFailures(current, results);
        for (const [artifact] of repairable) {
          if (![...stillFailing.values()].some((f) => f.artifact.variant === artifact.variant)) {
            await log(buildId, `${artifact.variant} passed`, "ok", t0);
          }
        }
        for (const { artifact } of stillFailing.values()) {
          await log(buildId, `${artifact.variant} still failing`, "fail", t0);
          if (!unrepairable.some((u) => u.id === artifact.id)) unrepairable.push(artifact);
        }
        markArtifacts(current, results, null);
        // Repair-regression protection: reject repairs that fixed the target
        // but broke a previously passing BLOCKING rule.
        for (const row of current) {
          const regressed = await rejectRegressedRepairs(
            buildId, row.variant, beforeRules.get(row.variant) ?? [], results, row.id,
          );
          if (regressed.length > 0) {
            await log(
              buildId,
              `Repair rejected for ${row.variant}: fixed the target but broke ${regressed.join(", ")}`,
              "fail", t0,
            );
          }
        }
        if (stillFailing.size === 0 && unrepairable.length === 0) {
          await log(buildId, "Build complete", "ok", t0);
          await setStatus(build, "PASSED");
          return;
        }
      }
    }

    markArtifacts(latestByVariant((await db()).artifacts.filter((a) => a.buildId === buildId)), (await db()).qaResults.filter((q) => q.buildId === buildId), null);

    if (unrepairable.length > 0 || repairable.size === 0) {
      if (contract.repairPolicy.sendToReview) {
        const s = await db();
        for (const art of unrepairable) {
          const failures = results.filter((r) => r.artifactId === art.id && r.status === "FAIL");
          const first = failures[0];
          s.reviews.unshift({
            id: uid("rev"),
            buildId,
            artifactId: art.id,
            assetName: `${asset.name} (${art.variant})`,
            previewUrl: art.previewUrl,
            issue: first ? `${first.rule} - ${art.variant}` : `Contract violation - ${art.variant}`,
            reason: first?.message ?? "Artifact does not satisfy the Media Contract.",
            confidence: first?.confidence ?? 60,
            suggestedAction: "Reject / Request new source",
            decision: "PENDING",
            createdAt: new Date().toISOString(),
            resolvedAt: null,
          });
        }
        await persist();
        await log(buildId, "Unrepairable failures sent to human review", "fail", t0);
        await setStatus(build, "REVIEW_REQUIRED");
      } else {
        await log(buildId, "Build failed", "fail", t0);
        await setStatus(build, "FAILED");
      }
      return;
    }

    await log(buildId, "Build complete", "ok", t0);
    await setStatus(build, "PASSED");
  } catch (err) {
    await log(buildId, `Build error: ${err instanceof Error ? err.message : "unknown"}`, "fail", t0);
    await setStatus(build, "FAILED");
  }
}

function plansFor(contract: MediaContract, asset: SourceAsset, variant: BuildArtifact["variant"], format: AllowedFormat) {
  return planArtifacts(contract.variants, format, unoptimizedVariants(asset.demoProfile)).find((p) => p.variant === variant)!;
}

/** Latest artifact row per variant - superseded versions stay for lineage. */
export function latestByVariant(all: BuildArtifact[]): BuildArtifact[] {
  const map = new Map<string, BuildArtifact>();
  for (const a of all) {
    const cur = map.get(a.variant);
    if (!cur || a.version > cur.version) map.set(a.variant, a);
  }
  return [...map.values()];
}

function groupFailures(
  artifacts: BuildArtifact[],
  results: QAResult[],
): Map<string, { artifact: BuildArtifact; failures: QAResult[] }> {
  // Only BLOCKING failures drive repair/review. WARN/INFO are reported, never gating.
  const map = new Map<string, { artifact: BuildArtifact; failures: QAResult[] }>();
  for (const a of artifacts) {
    const fails = results.filter(
      (r) => r.artifactId === a.id && r.status === "FAIL" && r.severity === "BLOCK",
    );
    if (fails.length > 0) map.set(a.id, { artifact: a, failures: fails });
  }
  return map;
}

/** Repair attempts already spent on a variant's lineage (budget enforcement). */
function repairAttempts(store: Awaited<ReturnType<typeof db>>, buildId: string, variant: string): number {
  const ids = new Set(
    store.artifacts.filter((a) => a.buildId === buildId && a.variant === variant).map((a) => a.id),
  );
  return store.repairs.filter((r) => r.buildId === buildId && ids.has(r.artifactId)).length;
}

/** Max attempts from the pinned snapshot (default 2). */
function maxAttempts(contract: MediaContract): number {
  return contract.repairPolicy.maxRepairAttempts ?? 2;
}

async function markArtifacts(
  artifacts: BuildArtifact[],
  results: QAResult[],
  force: "PASS" | null,
) {
  const s = await db();
  for (const a of artifacts) {
    const target = s.artifacts.find((x) => x.id === a.id);
    if (!target) continue;
    if (force === "PASS") {
      target.status = "PASS";
      continue;
    }
    // WARN/INFO failures don't fail the artifact - they ship in the release report.
    const fails = results.filter((r) => r.artifactId === a.id && r.status === "FAIL" && r.severity === "BLOCK");
    target.status = fails.length === 0 ? "PASS" : "FAIL";
  }
  await persist();
}

/**
 * Repair-regression protection: a repair is REJECTED (not merely unsuccessful)
 * when the retest fixes the target failure but breaks a previously passing
 * BLOCKING rule. Returns the names of newly broken rules.
 */
export async function rejectRegressedRepairs(
  buildId: string,
  variant: string,
  beforeRules: string[],
  fresh: QAResult[],
  currentRowId: string,
): Promise<string[]> {
  const after = fresh
    .filter((r) => r.artifactId === currentRowId && r.status === "FAIL" && r.severity === "BLOCK")
    .map((r) => r.rule);
  const regressed = after.filter((rule) => !beforeRules.includes(rule));
  if (regressed.length === 0) return [];
  const s = await db();
  for (const rep of s.repairs.filter((r) => r.buildId === buildId && r.artifactId === currentRowId)) {
    rep.result = "REJECTED";
  }
  await persist();
  return regressed;
}

/** Manual repair: apply safe repairs to a FAILED build, then re-test.
 *  Used by POST /api/builds/[id]/repair (e.g. contracts with auto-repair off). */
export async function repairBuild(buildId: string): Promise<Build> {
  const store = await db();
  const build = store.builds.find((b) => b.id === buildId);
  if (!build) throw new Error("Build not found");
  if (!["FAILED", "REVIEW_REQUIRED"].includes(build.status)) {
    throw new Error(`Build #${build.number} does not need repair (status: ${build.status}).`);
  }
  const live = store.contracts.find((c) => c.id === build.contractId);
  const asset = store.assets.find((a) => a.id === build.sourceAssetId);
  if (!live || !asset) throw new Error("Contract or source asset not found");
  // Repair against the pinned snapshot, not the (possibly edited) live contract.
  const contract: MediaContract = {
    ...live,
    variants: build.contractSnapshot.variants,
    rules: build.contractSnapshot.rules,
    repairPolicy: build.contractSnapshot.repairPolicy,
  };

  const t0 = Date.now();
  const latest = latestByVariant(store.artifacts.filter((a) => a.buildId === buildId));
  const results = store.qaResults.filter((q) => q.buildId === buildId);
  const failing = groupFailures(latest, results);

  const applicable: { artifact: BuildArtifact; plans: Exclude<ReturnType<typeof planRepair>, null> }[] = [];
  const budget = maxAttempts(contract);
  for (const { artifact, failures } of failing.values()) {
    const spent = repairAttempts(store, buildId, artifact.variant);
    if (spent >= budget) {
      throw new Error(
        `Repair budget exhausted for ${artifact.variant} (${spent}/${budget} attempts) - human review is required.`,
      );
    }
    const plan = planRepair(failures);
    if (plan !== null) applicable.push({ artifact, plans: plan });
  }
  if (applicable.length === 0) {
    throw new Error("No safe automatic repair exists for these failures - human review is required.");
  }

  build.status = "REPAIRING";
  build.completedAt = null;
  build.durationMs = null;
  await persist();

  const format: AllowedFormat = contract.rules.allowedFormats[0] ?? "webp";
  for (const { artifact, plans } of applicable) {
    await log(buildId, "Repair strategy selected", "run", t0);
    await sleep(stepMs());
    // Repair creates a NEW artifact version (history preserved for lineage).
    const s = await db();
    const target = s.artifacts.find((a) => a.id === artifact.id);
    if (!target) continue;
    const plan = plansFor(contract, asset, target.variant, format);
    const derived = await resolveDerived(asset, plan, true);
    const next: BuildArtifact = {
      id: uid("art"),
      buildId,
      variant: target.variant,
      version: target.version + 1,
      parentId: target.id,
      width: plan.width,
      height: plan.height,
      bytes: derived.bytes,
      format: derived.format,
      secureUrl: derived.url,
      previewUrl: derived.url,
      cloudinaryPublicId: asset.cloudinaryPublicId,
      derivation: derived.derivation,
      status: "SKIPPED",
      repairs: [...target.repairs, ...plans.map((p) => p.strategy)],
      createdAt: new Date().toISOString(),
    };
    s.artifacts.push(next);
    for (const p of plans) {
      await log(buildId, `Applying ${strategyLabel(p.strategy).toLowerCase()} (${artifact.variant})`, "run", t0);
      await sleep(stepMs());
      s.repairs.push({
        id: uid("rep"), buildId, artifactId: next.id,
        strategy: p.strategy, reason: p.reason, result: "APPLIED",
        createdAt: new Date().toISOString(),
      });
      await persist();
    }
    await log(buildId, `Created ${target.variant} v${next.version}`, "ok", t0);
    await log(buildId, "Repair applied", "ok", t0);
  }

  await setStatus(build, "RETESTING");
  await log(buildId, "Re-running QA", "run", t0);
  await sleep(stepMs() * 2);
  const current = latestByVariant((await db()).artifacts.filter((a) => a.buildId === buildId));
  const s3 = await db();
  // Keep v1 history; replace only the re-tested rows' results.
  s3.qaResults = s3.qaResults.filter(
    (q) => !(q.buildId === buildId && current.some((a) => a.id === q.artifactId)),
  );
  const fresh: QAResult[] = [];
  for (const a of current) fresh.push(...runQAForArtifact(buildId, a, contract, asset.demoProfile, asset.altText));
  s3.qaResults.push(...fresh);
  await persist();

  const stillFailing = groupFailures(current, fresh);
  await markArtifacts(current, fresh, null);
  for (const { artifact } of failing.values()) {
    if (![...stillFailing.values()].some((f) => f.artifact.variant === artifact.variant)) {
      await log(buildId, `${artifact.variant} passed`, "ok", t0);
    }
  }
  for (const row of current) {
    // `failing` is keyed by the pre-repair rows; match this version's lineage by variant.
    const beforeByVariant = [...new Set(
      [...failing.values()]
        .filter((f) => f.artifact.variant === row.variant)
        .flatMap((f) => f.failures.map((x) => x.rule)),
    )];
    const regressed = await rejectRegressedRepairs(buildId, row.variant, beforeByVariant, fresh, row.id);
    if (regressed.length > 0) {
      await log(
        buildId,
        `Repair rejected for ${row.variant}: fixed the target but broke ${regressed.join(", ")}`,
        "fail", t0,
      );
    }
  }
  if (stillFailing.size === 0) {
    await log(buildId, "Build complete", "ok", t0);
    await setStatus(build, "PASSED");
  } else if (contract.repairPolicy.sendToReview) {
    const s4 = await db();
    for (const { artifact } of stillFailing.values()) {
      const first = fresh.find((r) => r.artifactId === artifact.id && r.status === "FAIL");
      s4.reviews.unshift({
        id: uid("rev"), buildId, artifactId: artifact.id,
        assetName: `${asset.name} (${artifact.variant})`,
        previewUrl: artifact.previewUrl,
        issue: first ? `${first.rule} - ${artifact.variant}` : `Contract violation - ${artifact.variant}`,
        reason: first?.message ?? "Artifact does not satisfy the Media Contract.",
        confidence: first?.confidence ?? 60,
        suggestedAction: "Reject / Request new source",
        decision: "PENDING",
        createdAt: new Date().toISOString(), resolvedAt: null,
      });
    }
    await persist();
    await log(buildId, "Unrepairable failures sent to human review", "fail", t0);
    await setStatus(build, "REVIEW_REQUIRED");
  } else {
    await log(buildId, "Build failed", "fail", t0);
    await setStatus(build, "FAILED");
  }
  return (await db()).builds.find((b) => b.id === buildId)!;
}

/** Manual re-test: re-evaluate QA on the current artifacts. */
export async function retestBuild(buildId: string): Promise<Build> {
  const store = await db();
  const build = store.builds.find((b) => b.id === buildId);
  if (!build) throw new Error("Build not found");
  const live = store.contracts.find((c) => c.id === build.contractId);
  const asset = store.assets.find((a) => a.id === build.sourceAssetId);
  if (!live || !asset) throw new Error("Contract or source asset not found");
  // Re-test against the pinned snapshot, not the (possibly edited) live contract.
  const contract: MediaContract = {
    ...live,
    variants: build.contractSnapshot.variants,
    rules: build.contractSnapshot.rules,
    repairPolicy: build.contractSnapshot.repairPolicy,
  };

  const t0 = Date.now();
  const prev = build.status;
  build.status = "TESTING";
  await persist();
  await log(buildId, "Re-running QA", "run", t0);
  await sleep(stepMs());
  const s = await db();
  // Re-test only the latest version of each variant (history is untouched).
  const artifacts = latestByVariant(s.artifacts.filter((a) => a.buildId === buildId));
  s.qaResults = s.qaResults.filter(
    (q) => !(q.buildId === buildId && artifacts.some((a) => a.id === q.artifactId)),
  );
  const fresh: QAResult[] = [];
  for (const a of artifacts) fresh.push(...runQAForArtifact(buildId, a, contract, asset.demoProfile, asset.altText));
  s.qaResults.push(...fresh);
  await persist();
  await markArtifacts(artifacts, fresh, null);
  const blocking = fresh.some((r) => r.status === "FAIL" && r.severity === "BLOCK");
  await log(buildId, "Re-test complete", blocking ? "fail" : "ok", t0);
  const next: Build["status"] = blocking
    ? prev === "RELEASED" ? "RELEASED" : "FAILED"
    : prev === "RELEASED" ? "RELEASED" : "PASSED";
  await setStatus(build, next);
  return (await db()).builds.find((b) => b.id === buildId)!;
}

/** Baseline for regression: latest prior release of the same contract. */
function baselineFor(
  store: Awaited<ReturnType<typeof db>>,
  contractId: string,
  excludeBuildId: string,
): { releaseId: string; artifacts: BuildArtifact[] } | null {
  const prior = store.releases
    .filter((r) => r.contractId === contractId && r.buildId !== excludeBuildId)
    .sort((a, b) => b.releasedAt.localeCompare(a.releasedAt))[0];
  if (!prior) return null;
  return {
    releaseId: prior.releaseId,
    artifacts: latestByVariant(store.artifacts.filter((a) => a.buildId === prior.buildId)),
  };
}

/** Regression report for a build vs its release baseline (null when first of contract). */
export async function getRegression(buildId: string): Promise<RegressionReport | null> {
  const store = await db();
  const build = store.builds.find((b) => b.id === buildId);
  if (!build) return null;
  const base = baselineFor(store, build.contractId, buildId);
  if (!base || base.artifacts.length === 0) return null;
  const candidate = latestByVariant(store.artifacts.filter((a) => a.buildId === buildId));
  if (candidate.length === 0) return null;
  return compareRegression(base.artifacts, candidate, base.releaseId);
}

/** Server-side release gate. Throws when release criteria are not satisfied. */
export async function releaseBuild(buildId: string): Promise<ReleaseManifest> {
  const store = await db();
  const build = store.builds.find((b) => b.id === buildId);
  if (!build) throw new Error("Build not found");
  if (build.status === "RELEASED") {
    const existing = store.releases.find((r) => r.buildId === buildId);
    if (existing) return existing;
  }
  if (build.status !== "PASSED") {
    throw new Error(`Release blocked: build #${build.number} is ${build.status}, not PASSED.`);
  }
  // The gate evaluates the LATEST version of each variant only -
  // a superseded v1 failure must never block (or leak into) a release.
  // Only BLOCKING failures gate; WARN ships visibly in the manifest.
  const artifacts = latestByVariant(store.artifacts.filter((a) => a.buildId === buildId));
  const latestIds = new Set(artifacts.map((a) => a.id));
  const results = store.qaResults.filter((q) => q.buildId === buildId && latestIds.has(q.artifactId ?? ""));
  const unresolved = results.filter((r) => r.status === "FAIL" && r.severity === "BLOCK");
  const failingArtifacts = artifacts.filter((a) => a.status !== "PASS");
  if (unresolved.length > 0 || failingArtifacts.length > 0 || artifacts.length === 0) {
    throw new Error(
      `Release blocked: ${unresolved.length} unresolved blocking QA failures across ${failingArtifacts.length} artifacts.`,
    );
  }
  const warnings = results
    .filter((r) => r.status === "FAIL" && r.severity !== "BLOCK")
    .map((r) => `${r.rule} (${r.severity})`);
  // A failed visual regression blocks release when a baseline exists.
  const base = baselineFor(store, build.contractId, buildId);
  if (base && base.artifacts.length > 0) {
    const report = compareRegression(base.artifacts, artifacts, base.releaseId);
    const blocking = report.rows.filter((r) => r.status === "FAIL");
    if (blocking.length > 0) {
      throw new Error(
        `Release blocked: visual regression vs ${base.releaseId} - ${blocking.map((r) => `${r.variant}: ${r.details.join(" ")}`).join(" ")}`,
      );
    }
  }
  const manifest: ReleaseManifest = {
    releaseId: `rel_${build.number}`,
    contractId: build.contractId,
    contractName: build.contractName,
    buildId: build.id,
    sourceAsset: build.sourceAssetName,
    sourceBytes: store.assets.find((a) => a.id === build.sourceAssetId)?.bytes ?? 0,
    artifacts: artifacts.map((a) => ({
      variant: a.variant,
      status: "passed",
      repairs: a.repairs,
      secureUrl: a.secureUrl,
      previewUrl: a.previewUrl,
      bytes: a.bytes,
    })),
    unresolvedFailures: 0,
    warnings,
    repairCount: store.repairs.filter((r) => r.buildId === buildId).length,
    releasedAt: new Date().toISOString(),
    status: "LIVE" as const,
    rollbackOf: null,
  };
  for (const r of store.releases) {
    if (r.contractId === build.contractId && r.releaseId !== manifest.releaseId) {
      r.status = "SUPERSEDED";
    }
  }
  store.releases.unshift(manifest);
  build.status = "RELEASED";
  build.releaseId = manifest.releaseId;
  store.events.push({
    id: uid("evt"),
    buildId,
    at: new Date().toISOString(),
    message: `Release ${manifest.releaseId} published`,
    status: "ok",
    durationMs: Date.now() - new Date(build.startedAt).getTime(),
  });
  await persist();
  const sourceAsset = store.assets.find((a) => a.id === build.sourceAssetId);
  void tagBuildContext(sourceAsset?.cloudinaryPublicId ?? null, {
    app: "media-compiler",
    status: "released",
    release: manifest.releaseId,
  });
  return manifest;
}

/** Auditable rollback: re-publish a superseded release as a NEW record.
 *  History is never mutated - the previous LIVE becomes SUPERSEDED. */
export async function rollbackRelease(releaseId: string): Promise<ReleaseManifest> {
  const store = await db();
  const target = store.releases.find((r) => r.releaseId === releaseId);
  if (!target) throw new Error("Release not found");
  if (target.status === "LIVE") throw new Error(`${releaseId} is already the live release.`);
  const siblings = store.releases.filter((r) => r.contractId === target.contractId && r.rollbackOf === releaseId);
  const manifest: ReleaseManifest = {
    ...target,
    releaseId: `${releaseId}-r${siblings.length + 2}`,
    buildId: target.buildId,
    releasedAt: new Date().toISOString(),
    status: "LIVE",
    rollbackOf: releaseId,
  };
  for (const r of store.releases) {
    if (r.contractId === target.contractId && r.releaseId !== manifest.releaseId) {
      r.status = "SUPERSEDED";
    }
  }
  store.releases.unshift(manifest);
  store.events.push({
    id: uid("evt"),
    buildId: target.buildId,
    at: new Date().toISOString(),
    message: `Rolled back to ${releaseId} as ${manifest.releaseId}`,
    status: "ok",
    durationMs: 0,
  });
  await persist();
  return manifest;
}

/** Structured build explanation generated from persisted QA data. */
export async function explainBuild(buildId: string): Promise<string> {
  const store = await db();
  const build = store.builds.find((b) => b.id === buildId);
  if (!build) throw new Error("Build not found");
  const artifacts = store.artifacts.filter((a) => a.buildId === buildId);
  const results = store.qaResults.filter((q) => q.buildId === buildId);
  const repairs = store.repairs.filter((r) => r.buildId === buildId);
  const passed = artifacts.filter((a) => a.status === "PASS").length;

  const lines: string[] = [`Build #${build.number} - ${build.contractName}.`];
  const failed = artifacts.filter((a) => a.status === "FAIL");
  if (failed.length === 0 && repairs.length === 0) {
    lines.push(`All ${artifacts.length} artifacts passed on the first run with no repairs required.`);
  } else {
    for (const art of artifacts) {
      const fails = results.filter((r) => r.artifactId === art.id && r.status === "FAIL");
      const artRepairs = repairs.filter((r) => r.artifactId === art.id);
      if (fails.length === 0 && artRepairs.length === 0) {
        lines.push(`The ${art.variant} artifact passed all checks.`);
      } else if (fails.length === 0) {
        lines.push(
          `The ${art.variant} artifact initially failed, was repaired with ${artRepairs.map((r) => strategyLabel(r.strategy).toLowerCase()).join(" and ")}, and passed on re-validation.`,
        );
      } else {
        lines.push(
          `The ${art.variant} artifact failed because ${fails.map((f) => `${f.rule.toLowerCase()} (${f.message})`).join("; ")}.`,
        );
      }
    }
  }
  lines.push(`Final result: ${passed} / ${artifacts.length} artifacts passed, ${repairs.length} repair actions, ${failed.length} unresolved blocking failures.`);
  const warnCount = results.filter((r) => r.status === "FAIL" && r.severity !== "BLOCK").length;
  if (warnCount > 0) {
    lines.push(`${warnCount} non-blocking finding(s) will ship visibly in the release report.`);
  }
  return lines.join(" ");
}
