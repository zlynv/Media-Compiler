"use client";

import { Check, ChevronRight, Circle, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ruleMappingRows } from "@/lib/transform-map";
import type { RegressionReport } from "@/lib/regression";
import { formatBytes } from "@/lib/format";
import type { Build, BuildArtifact, QAResult, RepairAction } from "@/lib/types";
import { cn } from "@/lib/utils";

type StageState = "pass" | "fail" | "run" | "skip" | "wait";

interface Stage {
  label: string;
  state: StageState;
  detail?: string;
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "pass") return <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="passed" />;
  if (state === "fail") return <X className="h-3.5 w-3.5 text-red-600" aria-label="failed" />;
  if (state === "run") return <ChevronRight className="building-dot h-3.5 w-3.5 text-blue-600" aria-label="running" />;
  return <Circle className="h-3.5 w-3.5 text-muted-foreground/50" aria-label="pending" />;
}

/** GitHub-Actions-style pipeline checklist derived from persisted build state. */
export function StageChecklist({
  build,
  artifacts,
  qa,
  repairs,
}: {
  build: Build;
  artifacts: BuildArtifact[];
  qa: QAResult[];
  repairs: RepairAction[];
}) {
  const live = ["QUEUED", "BUILDING", "ANALYZING", "TESTING", "REPAIRING", "RETESTING"].includes(build.status);
  const byCat = (cat: string) => qa.filter((q) => q.category === cat);
  const catState = (cat: string): Stage => {
    const list = byCat(cat);
    if (list.length === 0) return { label: catLabel(cat), state: live ? "run" : "skip" };
    // Only BLOCKING failures fail a stage - warnings never gate.
    const fails = list.filter((q) => q.status === "FAIL" && q.severity === "BLOCK").length;
    const warns = list.filter((q) => q.status === "FAIL" && q.severity !== "BLOCK").length;
    return {
      label: catLabel(cat),
      state: fails > 0 ? "fail" : "pass",
      detail: `${list.length - fails - warns}/${list.length}${warns > 0 ? ` +${warns} warn` : ""}`,
    };
  };
  const stages: Stage[] = [
    {
      label: "BUILD",
      state: artifacts.length > 0 ? "pass" : live ? "run" : "wait",
      detail: artifacts.length > 0 ? `${artifacts.length} variants` : undefined,
    },
    catState("technical"),
    catState("visual"),
    catState("policy"),
    catState("accessibility"),
    {
      label: "REPAIR",
      state: repairs.length > 0 ? "pass" : build.status === "REPAIRING" ? "run" : "skip",
      detail: repairs.length > 0 ? `${repairs.length} applied` : repairs.length === 0 && !live ? "not needed" : undefined,
    },
    {
      label: "RETEST",
      state: repairs.length > 0 && ["PASSED", "RELEASED", "REVIEW_REQUIRED", "FAILED"].includes(build.status)
        ? "pass"
        : build.status === "RETESTING"
          ? "run"
          : "skip",
    },
    {
      label: "RELEASE",
      state: build.status === "RELEASED" ? "pass" : build.status === "PASSED" ? "run" : "wait",
      detail: build.status === "RELEASED" && build.releaseId ? build.releaseId : undefined,
    },
  ];

  return (
    <Card>
      <CardContent className="flex flex-col gap-1 pt-5 sm:flex-row sm:flex-wrap sm:gap-x-5">
        {stages.map((s) => (
          <span
            key={s.label}
            className={cn(
              "flex items-center gap-1.5 font-mono text-xs font-semibold",
              s.state === "fail" ? "text-red-700" : s.state === "pass" ? "text-emerald-700" : "text-muted-foreground",
            )}
          >
            <StageIcon state={s.state} />
            {s.label}
            {s.detail && <span className="font-normal text-muted-foreground">· {s.detail}</span>}
          </span>
        ))}
      </CardContent>
    </Card>
  );
}

function catLabel(cat: string): string {
  if (cat === "technical") return "TECHNICAL QA";
  if (cat === "visual") return "VISUAL QA";
  if (cat === "accessibility") return "ACCESSIBILITY QA";
  return "POLICY QA";
}

/** Contract rule → Cloudinary operation mapping, rendered from one source of truth. */
export function ContractMapping({ maxSizeKb, compact }: { maxSizeKb: number; compact?: boolean }) {
  const rows = ruleMappingRows(maxSizeKb);
  return (
    <Card>
      <CardHeader className={compact ? "pb-2" : undefined}>
        <CardTitle className="text-sm">Contract → Cloudinary execution</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.rule} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-baseline sm:gap-2">
            <span className="shrink-0 font-medium">{r.rule}</span>
            <span className="hidden text-muted-foreground sm:inline">→</span>
            <code className="font-mono text-xs text-muted-foreground">{r.operation}</code>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Visual regression vs the release baseline (latest prior release, same contract). */
export function RegressionCard({ regression }: { regression: RegressionReport | null }) {
  if (!regression) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          No release baseline yet - this build becomes the reference once released.
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Visual regression <span className="font-normal text-muted-foreground">vs {regression.baselineRef}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {regression.rows.map((r) => (
          <div key={r.variant} className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
            <div>
              <p className="font-mono text-xs font-semibold">
                {r.variant}{" "}
                <span className="font-normal text-muted-foreground">
                  {formatBytes(r.baselineBytes)} → {formatBytes(r.candidateBytes)}
                  {r.deltaPct !== 0 && ` (${r.deltaPct > 0 ? "+" : ""}${r.deltaPct}%)`}
                </span>
              </p>
              {r.details.map((d, i) => (
                <p key={i} className="text-xs text-muted-foreground">{d}</p>
              ))}
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                r.status === "PASS" && "bg-emerald-100 text-emerald-800",
                r.status === "WARNING" && "bg-amber-100 text-amber-800",
                r.status === "FAIL" && "bg-red-100 text-red-800",
              )}
            >
              {r.status}
            </span>
          </div>
        ))}
        {regression.blocking && (
          <p className="text-xs text-red-600">A failed regression blocks release until resolved.</p>
        )}
      </CardContent>
    </Card>
  );
}
