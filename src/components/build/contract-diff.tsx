"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GitCompare, Hammer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCompile } from "@/lib/api";
import { diffContracts } from "@/lib/contracts";
import type { Build, MediaContract } from "@/lib/types";
import { cn } from "@/lib/utils";

const CHANGE_STYLE: Record<string, string> = {
  ADDED: "bg-emerald-100 text-emerald-800",
  REMOVED: "bg-red-100 text-red-800",
  CHANGED: "bg-amber-100 text-amber-800",
};

/**
 * Compare Versions - GitHub-diff-style view over contract version history,
 * with impact analysis and one-click rebuild of affected assets.
 */
export function ContractDiff({
  contract,
  builds,
}: {
  contract: MediaContract;
  builds: Build[];
}) {
  const router = useRouter();
  const compile = useCompile();
  const versions = [...contract.history.map((h) => h.version), contract.version].sort((a, b) => a - b);
  const [from, setFrom] = React.useState<number>(versions[versions.length - 2] ?? contract.version);
  const [to, setTo] = React.useState<number>(contract.version);

  const snapshotOf = (v: number) =>
    v === contract.version
      ? { variants: contract.variants, rules: contract.rules, repairPolicy: contract.repairPolicy }
      : contract.history.find((h) => h.version === v);

  const a = snapshotOf(from);
  const b = snapshotOf(to);
  const rows = a && b && from !== to ? diffContracts(a, b) : [];
  const affected = builds.filter((x) => x.contractVersion === from);

  const recompile = () => {
    const latest = builds[0];
    if (!latest) {
      toast.error("No source asset has been compiled against this contract yet");
      return;
    }
    compile.mutate(
      { sourceAssetId: latest.sourceAssetId, contractId: contract.id },
      {
        onSuccess: (res) => {
          toast.success(`Rebuilding affected assets against v${contract.version}`);
          router.push(`/builds/${res.build.id}`);
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (versions.length < 2) {
    return (
      <Card>
        <CardContent className="pt-5 text-sm text-muted-foreground">
          <p className="flex items-center gap-2 font-medium text-foreground">
            <GitCompare className="h-4 w-4" /> Compare Versions
          </p>
          <p className="mt-1">
            Only v{contract.version} exists so far. Edit this contract to create v{contract.version + 1} -
            every edit freezes the previous version here for comparison.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <GitCompare className="h-4 w-4" /> Compare Versions
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <VersionSelect value={from} onChange={setFrom} versions={versions} label="From" />
          <span className="text-muted-foreground">→</span>
          <VersionSelect value={to} onChange={setTo} versions={versions} label="To" />
        </div>
        {from === to ? (
          <p className="text-sm text-muted-foreground">Select two different versions to compare.</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No rule differences between v{from} and v{to}.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">{r.area}</td>
                      <td className="px-3 py-2 font-medium">{r.label}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <span className="text-red-700 line-through">{r.from}</span>
                        <span className="mx-1.5 text-muted-foreground">→</span>
                        <span className="text-emerald-700">{r.to}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold", CHANGE_STYLE[r.change])}>
                          {r.change}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 p-3 text-sm">
              <p>
                Impact: <span className="font-semibold">{affected.length} build{affected.length === 1 ? "" : "s"}</span>{" "}
                compiled against v{from} {affected.length > 0 && <span className="text-muted-foreground">may no longer satisfy v{to}</span>}
              </p>
              <Button size="sm" onClick={recompile} disabled={compile.isPending || affected.length === 0}>
                <Hammer /> {compile.isPending ? "Queueing…" : "Rebuild Affected Assets"}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function VersionSelect({
  value,
  onChange,
  versions,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  versions: number[];
  label: string;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 rounded-md border border-input bg-card px-2 text-sm font-mono"
        aria-label={`${label} version`}
      >
        {versions.map((v) => (
          <option key={v} value={v}>
            v{v}
          </option>
        ))}
      </select>
    </label>
  );
}

export function VersionBadge({ version }: { version: number }) {
  return <Badge variant="secondary">v{version}</Badge>;
}
