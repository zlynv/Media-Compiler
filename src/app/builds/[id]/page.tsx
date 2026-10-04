"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowLeft, Hammer, HelpCircle, RefreshCw, Rocket, Wrench } from "lucide-react";
import { toast } from "sonner";
import { ArtifactGrid, QASummary } from "@/components/build/artifacts";
import { BeforeAfter, BuildLog, RepairTimeline } from "@/components/build/build-log";
import { ContractMapping, RegressionCard, StageChecklist } from "@/components/build/stages";
import { CloudinaryTrace } from "@/components/build/trace";
import { ArtifactLineage } from "@/components/build/lineage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Skeleton,
} from "@/components/ui/primitives";
import { BuildStatusBadge, EmptyState, QAStatusBadge, SeverityBadge } from "@/components/shared";
import {
  useBuild,
  useExplanation,
  useReleaseBuild,
  useRepairBuild,
  useRetestBuild,
} from "@/lib/api";
import type { BuildArtifact } from "@/lib/types";
import { formatBytes, formatDateTime, formatDuration } from "@/lib/format";
import { isTerminal } from "@/lib/types";

export default function BuildDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const [explainOpen, setExplainOpen] = React.useState(false);

  // Poll while the build is live; stop once terminal.
  const [live, setLive] = React.useState(true);
  const { data, isLoading, isError, refetch } = useBuild(id, live ? 900 : false);
  const repair = useRepairBuild(id);
  const retest = useRetestBuild(id);
  const release = useReleaseBuild(id);
  const { data: explainData, isLoading: explainLoading } = useExplanation(id, explainOpen);

  const build = data?.build;
  React.useEffect(() => {
    if (build && isTerminal(build.status)) {
      const t = setTimeout(() => setLive(false), 2500);
      return () => clearTimeout(t);
    }
  }, [build?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        title="Could not load this build"
        description="The compiler API did not respond. Retry to reload the build detail."
        action={<Button onClick={() => refetch()}>Retry</Button>}
      />
    );
  }
  if (!build || !data) {
    return <EmptyState title="Build not found" description="This build does not exist." />;
  }

  const { artifacts, qa, repairs, events, release: releaseData, contract, asset, regression } = data;
  // Summaries evaluate the latest version of each variant; history stays visible in lineage.
  const latestByVariant = Object.values(
    artifacts.reduce<Record<string, BuildArtifact>>((m, a) => {
      if (!m[a.variant] || a.version > m[a.variant].version) m[a.variant] = a;
      return m;
    }, {}),
  );
  const latestIds = new Set(latestByVariant.map((a) => a.id));
  const qaLatest = qa.filter((q) => !q.artifactId || latestIds.has(q.artifactId));
  const fails = qaLatest.filter((q) => q.status === "FAIL");
  const repairableFails = fails.filter((f) => f.repairability !== "NONE");
  const canRelease = build.status === "PASSED" || build.status === "RELEASED";
  const passedCount = latestByVariant.filter((a) => a.status === "PASS").length;

  const mutate = (
    m: { mutate: (_: void, o: { onSuccess?: () => void; onError?: (e: Error) => void }) => void; isPending: boolean },
    ok: string,
  ) =>
    m.mutate(undefined, {
      onSuccess: () => {
        setLive(true);
        toast.success(ok);
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-3">
        <Link href="/builds">
          <ArrowLeft /> Builds
        </Link>
      </Button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">BUILD #{build.number}</h1>
            <BuildStatusBadge status={build.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {build.contractName} v{build.contractVersion} · {build.sourceAssetName} · started {formatDateTime(build.startedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={explainOpen} onOpenChange={setExplainOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <HelpCircle /> Explain Build
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Why did build #{build.number} behave this way?</DialogTitle>
                <DialogDescription>Generated from persisted QA data - not a chatbot.</DialogDescription>
              </DialogHeader>
              {explainLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <ul className="flex list-inside list-disc flex-col gap-1.5 text-sm leading-relaxed">
                  {(explainData?.explanation ?? "")
                    .split(/(?<=\.)\s+/)
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((s, i, arr) => (
                      <li key={i} className={i === arr.length - 1 ? "font-medium" : undefined}>
                        {s}
                      </li>
                    ))}
                </ul>
              )}
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={() => mutate(retest, "Re-test queued")} disabled={retest.isPending}>
            <RefreshCw /> Re-test
          </Button>
        </div>
      </div>

      {/* Quality summary strip */}
      <div className="mt-5">
        <StageChecklist build={build} artifacts={latestByVariant} qa={qaLatest} repairs={repairs} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Artifacts", value: `${passedCount} / ${latestByVariant.length}` },
          { label: "QA checks", value: qa.length },
          { label: "Repairs", value: repairs.length },
          { label: "Build time", value: formatDuration(build.durationMs) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>

      {/* The repair moment */}
      {fails.length > 0 && build.status !== "PASSED" && build.status !== "RELEASED" && (
        <Card className="mt-4 border-amber-300 bg-amber-50/60">
          <CardContent className="flex flex-col gap-2 pt-5">
            {repairableFails.length > 0 ? (
              <>
                <Badge variant="warning" className="w-fit">REPAIRABLE</Badge>
                <p className="text-sm">
                  <span className="font-medium">Reason: </span>
                  {fails.slice(0, 2).map((f) => f.message).join(" ")}
                </p>
                <p className="text-sm text-muted-foreground">
                  Recommended repair: → {[...new Set(repairableFails.map((f) => repairLabelFor(f.rule)))].join(" → ")}
                </p>
                <div className="mt-1">
                  <Button onClick={() => mutate(repair, "Repair started")} disabled={repair.isPending}>
                    <Wrench /> {repair.isPending ? "REPAIRING…" : "AUTO REPAIR"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Badge variant="danger" className="w-fit">AUTO-REPAIR NOT SAFE</Badge>
                <p className="text-sm">
                  <span className="font-medium">Reason: </span>
                  The source asset does not contain enough visual information to satisfy the
                  required {fails[0]?.rule.toLowerCase() ?? "contract"} rule. {fails[0]?.message ?? ""}
                </p>
                <p className="font-mono text-xs text-muted-foreground">
                  Confidence: {fails[0]?.confidence ?? 60}% · Recommended action: request a new source asset.
                </p>
                <div className="mt-1">
                  <Button variant="outline" asChild>
                    <Link href="/review">Open Review Queue</Link>
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="timeline" className="mt-5">
        <TabsList>
          <TabsTrigger value="timeline">Build Timeline</TabsTrigger>
          <TabsTrigger value="artifacts">Artifacts ({artifacts.length})</TabsTrigger>
          <TabsTrigger value="qa">QA Results ({fails.length > 0 ? `${fails.length} failing` : "all passing"})</TabsTrigger>
          <TabsTrigger value="repairs">Repairs ({repairs.length})</TabsTrigger>
          <TabsTrigger value="release">Release</TabsTrigger>
        </TabsList>

        <TabsContent value="timeline">
          <div className="flex flex-col gap-4">
            <CloudinaryTrace build={build} asset={asset} artifacts={artifacts} repairs={repairs} />
            <BuildLog events={events} />
          </div>
        </TabsContent>

        <TabsContent value="artifacts">
          <div className="flex flex-col gap-5">
            {contract && <ContractMapping maxSizeKb={contract.rules.maxSizeKb} compact />}
            <ArtifactLineage
              artifacts={artifacts}
              sourceName={build.sourceAssetName}
              contractName={build.contractName}
              contractVersion={build.contractVersion}
              buildNumber={build.number}
              releaseId={build.releaseId}
            />
            <ArtifactGrid artifacts={latestByVariant} qa={qa} />
            {latestByVariant
              .filter((a) => a.repairs.length > 0)
              .map((a) => {
                const sourceBytes = asset?.bytes ?? a.bytes;
                const savings = Math.max(0, Math.round((1 - a.bytes / sourceBytes) * 100));
                return (
                  <div key={a.id}>
                    <p className="mb-2 text-sm font-medium">
                      Before / After - <span className="font-mono">{a.variant}</span>{" "}
                      <span className="font-mono text-xs font-normal text-emerald-700">
                        {formatBytes(sourceBytes)} → {formatBytes(a.bytes)} (−{savings}% measured)
                      </span>
                    </p>
                    <BeforeAfter
                      beforeUrl={asset?.previewUrl ?? a.previewUrl}
                      afterUrl={a.previewUrl}
                      beforeMeta={`Original master · ${asset ? formatBytes(asset.bytes) : ""}`}
                      afterMeta={`${a.width} × ${a.height} · ${formatBytes(a.bytes)} · ${a.repairs.join(", ").replace(/_/g, " ")}`}
                      alt={`${a.variant} artifact`}
                    />
                  </div>
                );
              })}
          </div>
        </TabsContent>

        <TabsContent value="qa">
          <div className="grid gap-4 lg:grid-cols-3">
            <QASummary qa={qaLatest} />
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Checks by artifact</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {artifacts.map((a) => (
                  <div key={a.id}>
                    <p className="mb-1.5 font-mono text-xs font-semibold">
                      {a.variant} <span className="font-normal text-muted-foreground">v{a.version}</span>
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {qa
                        .filter((q) => q.artifactId === a.id)
                        .map((q) => (
                          <div key={q.id} className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                            <div>
                              <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                                {q.rule}
                                <SeverityBadge severity={q.severity} />
                                <span className="font-normal text-muted-foreground">· {q.category} · {q.confidence}%</span>
                              </p>
                              <p className="text-xs text-muted-foreground">{q.message}</p>
                            </div>
                            <QAStatusBadge status={q.status} />
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
                {artifacts.length === 0 && <p className="text-sm text-muted-foreground">No QA results yet - the build is still running.</p>}
              </CardContent>
            </Card>
          </div>
          <div className="mt-4">
            <RegressionCard regression={regression} />
          </div>
        </TabsContent>

        <TabsContent value="repairs">
          <Card>
            <CardHeader>
              <CardTitle>Repair History</CardTitle>
            </CardHeader>
            <CardContent>
              {repairs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repairs were required for this build.</p>
              ) : (
                <RepairTimeline
                  repairs={repairs.map((r) => ({ id: r.id, strategy: r.strategy, reason: r.reason, createdAt: r.createdAt }))}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="release">
          <ReleasePanel
            buildId={id}
            buildNumber={build.number}
            contractName={build.contractName}
            canRelease={canRelease}
            released={build.status === "RELEASED"}
            releaseData={releaseData}
            qa={qaLatest}
            artifacts={latestByVariant}
            repairs={repairs.length}
            warnings={qaLatest.filter((q) => q.status === "FAIL" && q.severity !== "BLOCK").map((q) => `${q.rule} (${q.severity})`)}
            regressionBlocking={regression?.blocking ?? false}
            regressionRef={regression?.baselineRef ?? null}
            onRelease={() => mutate(release, "Release published")}
            releasing={release.isPending}
          />
        </TabsContent>
      </Tabs>

      <p className="mt-6 font-mono text-xs text-muted-foreground">
        Contract {build.contractName} v{build.contractVersion} (pinned snapshot) · Source {build.sourceAssetName} · Compiler v0.1.0
      </p>
    </div>
  );
}

function repairLabelFor(rule: string): string {
  if (rule === "Maximum file size") return "Automatic quality optimization";
  if (rule === "Allowed format") return "Format conversion";
  if (rule === "Clean background" || rule === "No visible people") return "Background cleanup";
  return "Smart crop";
}

function ReleasePanel(props: {
  buildId: string;
  buildNumber: number;
  contractName: string;
  canRelease: boolean;
  released: boolean;
  releaseData: { releaseId: string; warnings: string[] } | null;
  qa: { status: string; category: string; severity?: string }[];
  artifacts: { status: string }[];
  repairs: number;
  warnings: string[];
  regressionBlocking: boolean;
  regressionRef: string | null;
  onRelease: () => void;
  releasing: boolean;
}) {
  // Readiness counts only BLOCKING failures - WARN/INFO ship visibly, never gate.
  const isBlocking = (q: { status: string; severity?: string }) =>
    q.status === "FAIL" && (q.severity ?? "BLOCK") === "BLOCK";
  const pct = (cats: string[]) => {
    const list = props.qa.filter((q) => cats.includes(q.category));
    const blocked = list.filter(isBlocking).length;
    return { ok: blocked === 0, text: `${list.length - blocked}/${list.length}` };
  };
  const t = pct(["technical"]);
  const v = pct(["visual", "accessibility"]);
  const p = pct(["policy"]);
  const checks: { label: string; ok: boolean }[] = [
    { label: "All artifacts generated", ok: props.artifacts.length > 0 },
    { label: `Technical QA passed (${t.text})`, ok: t.ok },
    { label: `Visual + accessibility QA passed (${v.text})`, ok: v.ok },
    { label: `Policy QA passed (${p.text})`, ok: p.ok },
    { label: "No unresolved blocking failures", ok: !props.qa.some(isBlocking) },
    {
      label: props.regressionRef ? `No blocking regressions (vs ${props.regressionRef})` : "No baseline to regress against",
      ok: !props.regressionBlocking,
    },
  ];
  const ready = checks.every((c) => c.ok);
  const [blockedError, setBlockedError] = React.useState<string | null>(null);
  const [attempting, setAttempting] = React.useState(false);

  // The gate is demonstrable: attempting release on a failing build hits the
  // server invariant and returns 409 - shown inline, exactly as the API says.
  const attemptBlockedRelease = async () => {
    setAttempting(true);
    setBlockedError(null);
    try {
      const res = await fetch(`/api/builds/${props.buildId}/release`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Release blocked (${res.status})`);
    } catch (e) {
      setBlockedError(e instanceof Error ? e.message : "Release blocked");
    } finally {
      setAttempting(false);
    }
  };

  if (props.released && props.releaseData) {
    return (
      <Card className="border-emerald-300">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <Badge variant="success" className="text-sm">RELEASED ✓</Badge>
          <p className="font-mono text-lg font-semibold">Build #{props.buildNumber}</p>
          <p className="text-sm text-muted-foreground">
            {props.artifacts.length} / {props.artifacts.length} assets passed · {props.repairs} automatic repair
            {props.repairs === 1 ? "" : "s"} · 0 unresolved blocking failures
          </p>
          {props.releaseData.warnings.length > 0 && (
            <p className="max-w-md text-xs text-amber-700">
              Shipped with {props.releaseData.warnings.length} warning{props.releaseData.warnings.length === 1 ? "" : "s"}:{" "}
              {props.releaseData.warnings.join(", ")}
            </p>
          )}
          <Button variant="outline" asChild className="mt-2">
            <Link href={`/releases/${props.releaseData.releaseId}`}>
              <Rocket /> View Release {props.releaseData.releaseId}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Release readiness</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-sm">
            <span className={c.ok ? "text-emerald-600" : "text-red-600"}>{c.ok ? "✓" : "✕"}</span>
            {c.label}
          </div>
        ))}
        <div className="mt-3">
          {props.warnings.length > 0 && (
            <p className="mb-2 rounded-lg border border-amber-300 bg-amber-50/60 p-2.5 text-xs text-amber-800">
              {props.warnings.length} non-blocking finding{props.warnings.length === 1 ? "" : "s"} will ship visibly:{" "}
              {props.warnings.join(", ")}
            </p>
          )}
          {ready && props.canRelease ? (
            <Button size="lg" onClick={props.onRelease} disabled={props.releasing}>
              <Hammer /> {props.releasing ? "RELEASING…" : "RELEASE"}
            </Button>
          ) : (
            <>
              <Button size="lg" variant="outline" onClick={attemptBlockedRelease} disabled={attempting}>
                <Hammer /> {attempting ? "CHECKING GATE…" : "RELEASE"}
              </Button>
              {blockedError ? (
                <div className="mt-2 rounded-lg border border-red-300 bg-red-50 p-3">
                  <p className="font-mono text-sm font-semibold text-red-700">409 RELEASE BLOCKED</p>
                  <p className="mt-0.5 text-sm text-red-700">{blockedError}</p>
                  <p className="mt-0.5 text-xs text-red-600">This media build cannot enter production.</p>
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  Blocked - artifacts do not yet satisfy the Media Contract. Try it: the server gate refuses.
                </p>
              )}
            </>
          )}
          {!ready && <p className="mt-1 text-xs text-muted-foreground">The release gate is enforced server-side.</p>}
        </div>
      </CardContent>
    </Card>
  );
}
