"use client";

import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/primitives";
import { BuildStatusBadge, EmptyState, PageHeader, Stat } from "@/components/shared";
import { useBuilds } from "@/lib/api";
import { formatDuration } from "@/lib/format";

export default function DashboardPage() {
  const { data, isLoading, isError } = useBuilds();

  const builds = data?.builds ?? [];
  const repairsByBuild = data?.repairsByBuild ?? {};
  const passed = builds.filter((b) => b.status === "PASSED" || b.status === "RELEASED").length;
  const review = builds.filter((b) => b.status === "REVIEW_REQUIRED").length;
  const autoRepairs = Object.values(repairsByBuild).reduce((a, b) => a + b, 0);

  return (
    <div>
      <PageHeader
        title="Media Compiler"
        description="Build, test, repair and release production-ready visual assets."
        action={
          <Button asChild>
            <Link href="/contracts/new">
              <Plus /> Create Contract
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Builds" value={isLoading ? "-" : builds.length} />
        <Stat label="Passed" value={isLoading ? "-" : passed} />
        <Stat label="Auto Repairs" value={isLoading ? "-" : autoRepairs} />
        <Stat label="Needs Review" value={isLoading ? "-" : review} />
      </div>

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Recent Builds</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/builds">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              title="Could not load builds"
              description="The compiler API did not respond. Check that the dev server is running and retry."
            />
          ) : builds.length === 0 ? (
            <EmptyState
              title="No builds yet"
              description="Create a media contract, upload a master asset and click Compile to run your first build."
              action={
                <Button asChild>
                  <Link href="/contracts/new">
                    <Plus /> Create Contract
                  </Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Build</th>
                    <th className="py-2 pr-4 font-medium">Contract</th>
                    <th className="py-2 pr-4 font-medium">Status</th>
                    <th className="py-2 pr-4 font-medium">Repairs</th>
                    <th className="py-2 pr-4 font-medium">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {builds.slice(0, 8).map((b) => (
                    <tr key={b.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                      <td className="py-2.5 pr-4 font-mono font-medium">
                        <Link href={`/builds/${b.id}`} className="hover:underline">
                          #{b.number}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4">{b.contractName}</td>
                      <td className="py-2.5 pr-4">
                        <BuildStatusBadge status={b.status} />
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">
                        {repairsByBuild[b.id] ?? 0}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">
                        {formatDuration(b.durationMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
