"use client";

import { Check, ChevronRight, X } from "lucide-react";
import type { BuildEvent } from "@/lib/types";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export function BuildLog({ events }: { events: BuildEvent[] }) {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at));
  return (
    <div className="rounded-xl border border-border bg-zinc-950 p-4 text-zinc-100" role="log" aria-label="Build log">
      {sorted.length === 0 && <p className="font-mono text-xs text-zinc-500">Waiting for build events…</p>}
      {sorted.map((e) => (
        <div key={e.id} className="log-enter flex items-center gap-3 py-1 font-mono text-xs">
          <span className="shrink-0 tabular-nums text-zinc-500">{formatTime(e.at)}</span>
          <span className="min-w-0 flex-1 truncate">{e.message}</span>
          {e.status === "ok" && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-label="done" />}
          {e.status === "fail" && <X className="h-3.5 w-3.5 shrink-0 text-red-400" aria-label="failed" />}
          {e.status === "run" && <ChevronRight className="building-dot h-3.5 w-3.5 shrink-0 text-blue-400" aria-label="running" />}
        </div>
      ))}
    </div>
  );
}

export function RepairTimeline({ repairs }: { repairs: { id: string; strategy: string; reason: string; createdAt: string }[] }) {
  if (repairs.length === 0) return null;
  return (
    <ol className="relative ml-2 flex flex-col gap-3 border-l border-border pl-5">
      {repairs.map((r) => (
        <li key={r.id} className="relative">
          <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-4 ring-amber-100" />
          <p className="text-sm font-medium">{r.strategy.replace(/_/g, " ")}</p>
          <p className="text-xs text-muted-foreground">{r.reason}</p>
          <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{formatTime(r.createdAt)}</p>
        </li>
      ))}
    </ol>
  );
}

export function BeforeAfter({ beforeUrl, afterUrl, beforeMeta, afterMeta, alt }: {
  beforeUrl: string;
  afterUrl: string;
  beforeMeta: string;
  afterMeta: string;
  alt: string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[
        { label: "BEFORE", url: beforeUrl, meta: beforeMeta },
        { label: "AFTER", url: afterUrl, meta: afterMeta },
      ].map((p) => (
        <figure key={p.label} className={cn("overflow-hidden rounded-xl border", p.label === "AFTER" ? "border-emerald-300" : "border-border")}>
          <figcaption className={cn(
            "px-3 py-1.5 font-mono text-[11px] font-semibold tracking-widest",
            p.label === "AFTER" ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground",
          )}>
            {p.label}
          </figcaption>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.url} alt={`${alt} ${p.label.toLowerCase()}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
          <figcaption className="px-3 py-2 text-xs text-muted-foreground">{p.meta}</figcaption>
        </figure>
      ))}
    </div>
  );
}
