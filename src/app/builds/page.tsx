"use client";

import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/primitives";
import { BuildStatusBadge, EmptyState, PageHeader } from "@/components/shared";
import { useBuilds } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import type { BuildStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { key: string; label: string; match: (s: BuildStatus) => boolean }[] = [
  { key: "all", label: "All", match: () => true },
  { key: "passed", label: "Passed", match: (s) => s === "PASSED" },
  { key: "released", label: "Released", match: (s) => s === "RELEASED" },
  { key: "review", label: "Review", match: (s) => s === "REVIEW_REQUIRED" },
  { key: "failed", label: "Failed", match: (s) => s === "FAILED" },
];

export default function BuildsPage() {
  const [filter, setFilter] = React.useState("all");
  const { data, isLoading, isError, refetch } = useBuilds();
  const builds = (data?.builds ?? []).filter((b) =>
    FILTERS.find((f) => f.key === filter)?.match(b.status),
  );
  const repairsByBuild = data?.repairsByBuild ?? {};

  return (
    <div>
      <PageHeader title="Build History" description="Every compile, its tests, repairs and releases." />
      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            aria-pressed={filter === f.key}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Could not load builds"
          description="The compiler API did not respond. Retry to reload build history."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : builds.length === 0 ? (
        <EmptyState title="No builds match this filter" description="Run a compile from any contract to create a build." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5 font-medium">Build</th>
                    <th className="px-4 py-2.5 font-medium">Contract</th>
                    <th className="px-4 py-2.5 font-medium">Source</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Repairs</th>
                    <th className="px-4 py-2.5 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {builds.map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="px-4 py-3 font-mono font-medium">
                        <Link href={`/builds/${b.id}`} className="hover:underline">#{b.number}</Link>
                      </td>
                      <td className="px-4 py-3">{b.contractName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{b.sourceAssetName}</td>
                      <td className="px-4 py-3">
                        <BuildStatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{repairsByBuild[b.id] ?? 0}</td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">{formatDuration(b.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="mt-4">
        <Button variant="outline" asChild>
          <Link href="/contracts">Compile a new asset</Link>
        </Button>
      </div>
    </div>
  );
}
