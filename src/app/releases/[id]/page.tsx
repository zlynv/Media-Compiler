"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowLeft, Check, Copy, ExternalLink, History } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/primitives";
import { EmptyState } from "@/components/shared";
import { useReleases, useRollback } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";

export default function ReleaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const { data, isLoading } = useReleases();
  const rollback = useRollback();
  const release = data?.releases.find((r) => r.releaseId === id);
  const history = (data?.releases ?? []).filter(
    (r) => release && r.contractId === release.contractId && r.releaseId !== release.releaseId,
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!release) {
    return <EmptyState title="Release not found" description="This release does not exist." />;
  }

  const copyManifest = async () => {
    await navigator.clipboard.writeText(JSON.stringify(release, null, 2)).catch(() => undefined);
    toast.success("Release manifest copied");
  };

  const releasedTotal = release.artifacts.reduce((sum, a) => sum + a.bytes, 0);
  const savings =
    release.sourceBytes > 0 ? Math.max(0, Math.round((1 - releasedTotal / release.sourceBytes) * 100)) : 0;
  const savedBytes = release.sourceBytes - releasedTotal;

  return (
    <div>
      <Button variant="ghost" size="sm" asChild className="mb-3">
        <Link href="/releases">
          <ArrowLeft /> Releases
        </Link>
      </Button>

      <Card className="border-emerald-300">
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
          <div className="flex items-center gap-2">
            <Badge variant="success" className="text-sm">RELEASED ✓</Badge>
            <Badge variant={release.status === "LIVE" ? "info" : "secondary"}>{release.status}</Badge>
          </div>
          <p className="font-mono text-xl font-semibold">{release.releaseId}</p>
          <p className="text-sm text-muted-foreground">
            {release.artifacts.length} / {release.artifacts.length} assets passed · {release.repairCount} automatic repair
            {release.repairCount === 1 ? "" : "s"} · {release.unresolvedFailures} unresolved blocking failures
          </p>
          {(release.warnings ?? []).length > 0 && (
            <p className="max-w-lg text-xs text-amber-700">
              Shipped with {(release.warnings ?? []).length} non-blocking finding{(release.warnings ?? []).length === 1 ? "" : "s"}:{" "}
              {(release.warnings ?? []).join(", ")}
            </p>
          )}
          {savedBytes > 0 ? (
            <p className="font-mono text-sm text-emerald-700">
              Original {formatBytes(release.sourceBytes)} → Released {formatBytes(releasedTotal)} (−{savings}% measured)
            </p>
          ) : (
            <p className="font-mono text-sm text-emerald-700">
              {release.artifacts.length} variants delivered · {formatBytes(releasedTotal)} total
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Contract {release.contractName} · Source {release.sourceAsset} · {formatDateTime(release.releasedAt)}
          </p>
          {release.rollbackOf && (
            <p className="font-mono text-xs text-muted-foreground">rollback of {release.rollbackOf}</p>
          )}
          {release.status !== "LIVE" && (
            <Button
              variant="outline"
              className="mt-2"
              disabled={rollback.isPending}
              onClick={() =>
                rollback.mutate(release.releaseId, {
                  onSuccess: (res) => toast.success(`Rolled back - ${res.release.releaseId} is now live`),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              <History /> {rollback.isPending ? "Rolling back…" : `Rollback to ${release.releaseId}`}
            </Button>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {release.artifacts.map((a) => (
          <Card key={a.variant} className="overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.previewUrl} alt={`${a.variant} released asset`} className="aspect-square w-full object-cover" loading="lazy" />
            <CardContent className="pt-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{a.variant}</span>
                <Badge variant="success"><Check className="h-3 w-3" /> passed</Badge>
              </div>
              {a.repairs.length > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">Repairs: {a.repairs.join(", ").replace(/_/g, " ")}</p>
              )}
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{formatBytes(a.bytes)} delivered</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" asChild>
                  <a href={a.secureUrl} target="_blank" rel="noreferrer">
                    <ExternalLink /> View
                  </a>
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(a.secureUrl).catch(() => undefined);
                    toast.success("URL copied");
                  }}
                >
                  <Copy /> Copy URL
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Release history - {release.contractName}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {[{ ...release }, ...history].map((r) => (
            <div key={r.releaseId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <span className="font-mono font-medium">{r.releaseId}</span>
              <span className="text-xs text-muted-foreground">{formatDateTime(r.releasedAt)}</span>
              <Badge variant={r.status === "LIVE" ? "info" : "secondary"}>{r.status}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Release manifest</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs text-zinc-100">
            {JSON.stringify(release, null, 2)}
          </pre>
          <Button variant="outline" size="sm" className="mt-3" onClick={copyManifest}>
            <Copy /> Copy manifest
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
