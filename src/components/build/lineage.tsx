"use client";

import { ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BuildArtifact } from "@/lib/types";
import { formatBytes } from "@/lib/format";

/**
 * Artifact lineage - every derived version traceable to its parent:
 * source → v1 → (repair) → v2, with the contract/build/release that own it.
 */
export function ArtifactLineage({
  artifacts,
  sourceName,
  contractName,
  contractVersion,
  buildNumber,
  releaseId,
}: {
  artifacts: BuildArtifact[];
  sourceName: string;
  contractName: string;
  contractVersion: number;
  buildNumber: number;
  releaseId: string | null;
}) {
  const variants = [...new Set(artifacts.map((a) => a.variant))];
  const chains = variants.map((v) =>
    artifacts
      .filter((a) => a.variant === v)
      .sort((x, y) => x.version - y.version),
  );
  const multi = chains.filter((c) => c.length > 1);
  if (multi.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Artifact lineage</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {multi.map((chain) => (
          <div key={chain[0].variant}>
            <p className="mb-2 font-mono text-xs font-semibold">
              {chain[0].variant} <span className="font-normal text-muted-foreground">· {chain.length} versions</span>
            </p>
            <ol className="flex flex-wrap items-stretch gap-2">
              <LineageNode
                title="source"
                subtitle={sourceName}
                detail={`${contractName} v${contractVersion}`}
              />
              {chain.flatMap((a, i) => {
                const nodes = [];
                if (i > 0) {
                  nodes.push(
                    <li key={`${a.id}-op`} className="flex flex-col items-center justify-center gap-1 px-1 text-center">
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <span className="max-w-28 font-mono text-[10px] leading-tight text-muted-foreground">
                        {a.repairs.join(" + ").replace(/_/g, " ") || "re-derived"}
                      </span>
                    </li>,
                  );
                }
                nodes.push(
                  <LineageNode
                    key={a.id}
                    title={`${a.variant} v${a.version}`}
                    subtitle={`${a.width}×${a.height} · ${formatBytes(a.bytes)}`}
                    detail={`build #${buildNumber}${releaseId ? ` · ${releaseId}` : ""}`}
                    current={i === chain.length - 1}
                  />,
                );
                return nodes;
              })}
            </ol>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function LineageNode({
  title,
  subtitle,
  detail,
  current,
}: {
  title: string;
  subtitle: string;
  detail: string;
  current?: boolean;
}) {
  return (
    <li
      className={`flex min-w-32 flex-col justify-center gap-0.5 rounded-lg border px-3 py-2 ${
        current ? "border-emerald-300 bg-emerald-50/60" : "border-border bg-card"
      }`}
    >
      <span className="flex items-center gap-1.5 font-mono text-xs font-semibold">
        {title}
        {current && <Badge variant="success" className="px-1.5 py-0 text-[10px]">current</Badge>}
      </span>
      <span className="text-[11px] text-muted-foreground">{subtitle}</span>
      <span className="font-mono text-[10px] text-muted-foreground">{detail}</span>
    </li>
  );
}
