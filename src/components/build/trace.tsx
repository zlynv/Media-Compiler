"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/primitives";
import type { Build, BuildArtifact, RepairAction, SourceAsset } from "@/lib/types";

/**
 * Cloudinary Trace - makes Cloudinary's role in the build impossible to miss:
 * the real asset, its public ID, every operation Cloudinary executed, the
 * delivery optimizations, and the derived assets. Each operation opens the
 * exact transformation chain it ran.
 */
export function CloudinaryTrace({
  build,
  asset,
  artifacts,
  repairs,
}: {
  build: Build;
  asset: SourceAsset | null;
  artifacts: BuildArtifact[];
  repairs: RepairAction[];
}) {
  const publicId = asset?.cloudinaryPublicId ?? artifacts[0]?.cloudinaryPublicId ?? null;
  const strategies = [...new Set(repairs.map((r) => r.strategy))];

  const operations: { name: string; transformation: string; done: boolean }[] = [
    {
      name: "Upload",
      transformation: asset ? `upload → ${asset.cloudinaryPublicId ?? "demo delivery"}` : "upload → Cloudinary",
      done: true,
    },
    {
      name: "Smart crop",
      transformation: "c_fill + aspect ratio, g_auto on repair",
      done: strategies.includes("smart_crop"),
    },
    {
      name: "Quality optimization",
      transformation: "q_auto",
      done: strategies.includes("q_auto"),
    },
    {
      name: "Format optimization",
      transformation: "f_auto",
      done: strategies.includes("format_convert") || artifacts.some((a) => a.derivation.includes("f_auto")),
    },
    {
      name: "Background cleanup",
      transformation: "background transformation",
      done: strategies.includes("background_cleanup"),
    },
  ];

  const [copied, setCopied] = React.useState(false);
  const copyId = async () => {
    if (!publicId) return;
    await navigator.clipboard.writeText(publicId).catch(() => undefined);
    setCopied(true);
    toast.success("Public ID copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          CLOUDINARY TRACE
          <Badge variant="info">live provider</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5 text-sm">
        <div className="grid gap-1.5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Asset</p>
            <p className="font-medium">{build.sourceAssetName}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Public ID</p>
            {publicId ? (
              <button
                type="button"
                onClick={copyId}
                className="flex items-center gap-1.5 font-mono text-xs hover:underline"
                title="Copy public ID"
              >
                {publicId}
                {copied ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
              </button>
            ) : (
              <p className="font-mono text-xs text-muted-foreground">demo delivery (no Cloudinary asset)</p>
            )}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Operations</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {operations.map((op) => (
              <Dialog key={op.name}>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    className={`flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:border-foreground/40 ${
                      op.done ? "border-transparent bg-emerald-100 text-emerald-800" : "border-border text-muted-foreground"
                    }`}
                  >
                    {op.done && <Check className="h-3 w-3" />}
                    {op.name}
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Operation - {op.name}</DialogTitle>
                    <DialogDescription>Executed by Cloudinary for build #{build.number}.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2 text-sm">
                    <div className="grid grid-cols-[120px_1fr] gap-2">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-medium">{op.done ? "Executed ✓" : "Not used in this build"}</span>
                      <span className="text-muted-foreground">Transformation</span>
                      <code className="break-all font-mono text-xs">{op.transformation}</code>
                      <span className="text-muted-foreground">Provider</span>
                      <span>Cloudinary</span>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 border-t border-border pt-2.5">
          <p className="text-xs text-muted-foreground">
            Delivery <code className="font-mono">f_auto · q_auto</code>
          </p>
          <p className="text-xs text-muted-foreground">
            Derived assets{" "}
            <span className="font-mono font-semibold text-foreground">
              {new Set(artifacts.map((a) => a.variant)).size} variants · {artifacts.length} versions
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
