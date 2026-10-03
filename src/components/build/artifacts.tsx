"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/primitives";
import type { BuildArtifact, QAResult } from "@/lib/types";
import { formatBytes } from "@/lib/format";
import { planRepair } from "@/lib/repair";
import { QAStatusBadge, SeverityBadge } from "@/components/shared";

export function ArtifactCard({ artifact, qa }: { artifact: BuildArtifact; qa: QAResult[] }) {
  const fails = qa.filter((q) => q.artifactId === artifact.id && q.status === "FAIL");
  const plans = planRepair(fails);
  const [copied, setCopied] = React.useState(false);

  const copyUrl = async () => {
    await navigator.clipboard.writeText(artifact.secureUrl).catch(() => undefined);
    setCopied(true);
    toast.success("Artifact URL copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="overflow-hidden rounded-xl border border-border bg-card text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artifact.previewUrl} alt={`${artifact.variant} artifact`} className="aspect-square w-full object-cover" loading="lazy" />
          <span className="flex items-center justify-between px-3 py-2">
            <span className="font-mono text-xs font-semibold">
              {artifact.variant} <span className="font-normal text-muted-foreground">v{artifact.version}</span>
            </span>
            {artifact.status === "PASS" ? (
              <Check className="h-4 w-4 text-emerald-600" aria-label="passed" />
            ) : artifact.status === "FAIL" ? (
              <X className="h-4 w-4 text-red-600" aria-label="failed" />
            ) : (
              <Badge variant="secondary">{artifact.status}</Badge>
            )}
          </span>
          <span className="block px-3 pb-3 text-xs text-muted-foreground">
            {artifact.width} × {artifact.height} · {formatBytes(artifact.bytes)}
            {artifact.repairs.length > 0 && ` · ${artifact.repairs.length} repair${artifact.repairs.length > 1 ? "s" : ""}`}
            {fails.length > 0 && ` · ${fails.length} failure${fails.length > 1 ? "s" : ""}`}
          </span>
        </button>
      </DialogTrigger>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>
            Artifact {artifact.variant} v{artifact.version} - {artifact.status}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={artifact.previewUrl} alt={`${artifact.variant} artifact full preview`} className="w-full rounded-lg border border-border object-cover" />
          <div className="flex flex-col gap-3 text-sm">
            {fails.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3">
                <p className="font-mono text-[11px] font-semibold tracking-widest text-amber-800">
                  WHY DID THIS FAIL?
                </p>
                <ul className="mt-1 list-inside list-disc text-xs">
                  {fails.map((f) => (
                    <li key={f.id}>
                      {f.rule} - {f.message}
                      {f.rule === "Maximum file size" && ` (${formatBytes(artifact.bytes)} measured)`}
                    </li>
                  ))}
                </ul>
                {plans ? (
                  <p className="mt-1.5 text-xs">
                    <span className="font-medium">Repairability: HIGH. </span>
                    Selected strategy: {plans.map((p) => p.strategy.replace(/_/g, " ")).join(" + ")}.
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs">
                    <span className="font-medium">Repairability: NONE - auto-repair is not safe. </span>
                    The source lacks the visual information this rule needs.
                  </p>
                )}
              </div>
            )}
            {fails.length === 0 && artifact.repairs.length > 0 && (
              <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-3">
                <p className="font-mono text-[11px] font-semibold tracking-widest text-emerald-800">
                  WHY DID IT PASS AFTER REPAIR?
                </p>
                <p className="mt-1 text-xs">
                  Applied {artifact.repairs.join(", ").replace(/_/g, " ")} via Cloudinary, then re-validated:{" "}
                  {formatBytes(artifact.bytes)} · {artifact.width} × {artifact.height} · all checks green.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted/50 p-3 text-xs">
              <span className="text-muted-foreground">Dimensions</span>
              <span className="font-mono">{artifact.width} × {artifact.height}</span>
              <span className="text-muted-foreground">Format</span>
              <span className="font-mono uppercase">{artifact.format}</span>
              <span className="text-muted-foreground">Size</span>
              <span className="font-mono">{formatBytes(artifact.bytes)}</span>
              <span className="text-muted-foreground">Repairs</span>
              <span>{artifact.repairs.length === 0 ? "none" : artifact.repairs.join(", ")}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {qa
                .filter((q) => q.artifactId === artifact.id)
                .map((q) => (
                  <div key={q.id} className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
                    <div>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium">
                        {q.rule}
                        <SeverityBadge severity={q.severity} />
                      </p>
                      <p className="text-xs text-muted-foreground">{q.message}</p>
                    </div>
                    <QAStatusBadge status={q.status} />
                  </div>
                ))}
            </div>
            <div className="mt-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={copyUrl}>
                {copied ? <Check /> : <Copy />} Copy URL
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={artifact.secureUrl} target="_blank" rel="noreferrer">
                  <ExternalLink /> View
                </a>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ArtifactGrid({ artifacts, qa }: { artifacts: BuildArtifact[]; qa: QAResult[] }) {
  if (artifacts.length === 0) {
    return <p className="text-sm text-muted-foreground">Artifacts appear here once the build generates variants.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {artifacts.map((a) => (
        <ArtifactCard key={a.id} artifact={a} qa={qa} />
      ))}
    </div>
  );
}

export function QASummary({ qa }: { qa: QAResult[] }) {
  const cats = [
    { key: "technical", label: "Technical QA" },
    { key: "visual", label: "Visual QA" },
    { key: "policy", label: "Policy QA" },
    { key: "accessibility", label: "Accessibility QA" },
  ] as const;
  const blocking = qa.filter((q) => q.status === "FAIL" && q.severity === "BLOCK");
  const warnings = qa.filter((q) => q.status === "FAIL" && q.severity !== "BLOCK");
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Quality Checks</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {cats.map((c) => {
            const list = qa.filter((q) => q.category === c.key);
            const pass = list.filter((q) => q.status === "PASS").length;
            return (
              <div key={c.key} className="flex items-center justify-between text-sm">
                <span>{c.label}</span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {pass} / {list.length} passed
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 border-t border-border pt-3">
          {blocking.length === 0 ? (
            <Badge variant="success">ALL BLOCKING CHECKS PASSED</Badge>
          ) : (
            <Badge variant="danger">NEEDS REPAIR - {blocking.length} BLOCKING</Badge>
          )}
          {warnings.length > 0 && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              + {warnings.length} non-blocking finding{warnings.length === 1 ? "" : "s"} ({warnings.map((w) => `${w.rule} ${w.severity}`).join(", ")}) - ships visibly in the release report.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
