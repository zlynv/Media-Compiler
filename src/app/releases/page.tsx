"use client";

import Link from "next/link";
import { Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/primitives";
import { EmptyState, PageHeader } from "@/components/shared";
import { useReleases } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export default function ReleasesPage() {
  const { data, isLoading, isError, refetch } = useReleases();
  const releases = data?.releases ?? [];

  return (
    <div>
      <PageHeader title="Releases" description="Only assets that satisfy their contract are released." />
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Could not load releases"
          description="The compiler API did not respond. Retry to reload your releases."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : releases.length === 0 ? (
        <EmptyState title="No releases yet" description="Pass a build and click Release to publish your first release." />
      ) : (
        <div className="flex flex-col gap-3">
          {releases.map((r) => (
            <Link key={r.releaseId} href={`/releases/${r.releaseId}`}>
              <Card className="transition-colors hover:border-foreground/30">
                <CardContent className="flex flex-wrap items-center gap-3 pt-5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <Rocket className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">
                      {r.releaseId}{" "}
                      <Badge variant={r.status === "LIVE" ? "info" : "secondary"} className="ml-1">
                        {r.status}
                      </Badge>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {r.contractName} · {r.sourceAsset} · {formatDateTime(r.releasedAt)}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {r.artifacts.map((a) => (
                      <Badge key={a.variant} variant="success">{a.variant} ✓</Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
