"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Hammer, Upload } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContractMapping } from "@/components/build/stages";
import { ContractDiff } from "@/components/build/contract-diff";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/primitives";
import { EmptyState } from "@/components/shared";
import { useAssets, useCompile, useContract, useCreateAsset } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

export default function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
  const { data, isLoading, isError, refetch } = useContract(id);
  const { data: assetsData, isLoading: assetsLoading } = useAssets();
  const compile = useCompile();
  const createAsset = useCreateAsset();
  const [selectedAssetId, setSelectedAssetId] = React.useState<string | null>(null);
  const [Widget, setWidget] = React.useState<React.ComponentType<{
    uploadPreset?: string;
    onSuccess?: (r: unknown) => void;
    options?: Record<string, unknown>;
    children: React.ReactNode;
  }> | null>(null);

  React.useEffect(() => {
    if (CLOUD_NAME && UPLOAD_PRESET) {
      import("next-cloudinary").then((m) => setWidget(() => m.CldUploadWidget as never));
    }
  }, []);

  const contract = data?.contract;
  const assets = assetsData?.assets ?? [];
  const selected = assets.find((a) => a.id === selectedAssetId) ?? null;

  const onCompile = () => {
    if (!selected || !contract) return;
    compile.mutate(
      { sourceAssetId: selected.id, contractId: contract.id },
      {
        onSuccess: (res) => router.push(`/builds/${res.build.id}`),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        title="Could not load this contract"
        description="The compiler API did not respond. Retry to reload the contract."
        action={<Button onClick={() => refetch()}>Retry</Button>}
      />
    );
  }

  if (!contract) {
    return <EmptyState title="Contract not found" description="This contract does not exist." />;
  }

  const r = contract.rules;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{contract.name}</h1>
            <Badge variant="success">{contract.status}</Badge>
            <Badge variant="secondary">v{contract.version}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{contract.description || "No description"}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/contracts/new?edit=${id}`}>Edit Contract</Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Source */}
        <Card>
          <CardHeader>
            <CardTitle>Source Asset</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {assetsLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="aspect-square w-full" />
                ))}
              </div>
            ) : assets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No source assets yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {assets.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedAssetId(a.id)}
                    className={cn(
                      "overflow-hidden rounded-lg border text-left transition-colors",
                      selectedAssetId === a.id ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-foreground/40",
                    )}
                    aria-pressed={selectedAssetId === a.id}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.previewUrl} alt={a.name} className="aspect-square w-full object-cover" loading="lazy" />
                    <span className="block truncate px-1.5 py-1 text-[11px]">{a.name}</span>
                  </button>
                ))}
              </div>
            )}
            {selected ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
                <p className="font-medium">{selected.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formatBytes(selected.bytes)} · {selected.width} × {selected.height}
                </p>
                <p className="mt-1 text-xs font-medium text-emerald-700">READY TO COMPILE</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a master asset to compile.</p>
            )}
            {Widget ? (
              <Widget
                uploadPreset={UPLOAD_PRESET}
                options={{ sources: ["local", "url"], maxFiles: 1, resourceType: "image" }}
                onSuccess={(result) => {
                  const info = (result as { info?: Record<string, unknown> })?.info;
                  if (!info) return;
                  createAsset.mutate(
                    {
                      name: String(info.original_filename ?? info.public_id ?? "upload"),
                      secureUrl: String(info.secure_url ?? ""),
                      cloudinaryPublicId: String(info.public_id ?? ""),
                      width: Number(info.width ?? 0),
                      height: Number(info.height ?? 0),
                      bytes: Number(info.bytes ?? 0),
                      format: String(info.format ?? "jpg"),
                      altText: String(info.original_filename ?? info.public_id ?? "upload"),
                    },
                    {
                      onSuccess: (res) => {
                        setSelectedAssetId(res.asset.id);
                        toast.success("Master asset uploaded to Cloudinary");
                      },
                      onError: (e) => toast.error(e.message),
                    },
                  );
                }}
              >
                <Button variant="outline" className="w-full" type="button">
                  <Upload /> Select from Cloudinary
                </Button>
              </Widget>
            ) : (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Cloudinary Upload Widget is available once NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME and
                NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET are set. Demo assets above are ready to compile.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Contract spec */}
        <Card>
          <CardHeader>
            <CardTitle>Contract</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Variants</p>
              <div className="mt-1.5 flex gap-1.5">
                {contract.variants.map((v) => (
                  <Badge key={v} variant="secondary">{v}</Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Technical</p>
              <p className="mt-1">{r.minWidth}px minimum · {r.maxSizeKb} KB maximum</p>
              {(r.maxWidth != null || r.maxHeight != null || r.maxMegapixels != null) && (
                <p className="text-muted-foreground">
                  {[r.maxWidth != null && `≤ ${r.maxWidth}px wide`, r.maxHeight != null && `≤ ${r.maxHeight}px tall`, r.maxMegapixels != null && `≤ ${r.maxMegapixels} MP`].filter(Boolean).join(" · ")}
                </p>
              )}
              <p className="text-muted-foreground">{r.allowedFormats.map((f) => f.toUpperCase()).join(" / ")}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Visual</p>
              <ul className="mt-1 list-inside list-disc text-muted-foreground">
                {r.requireProductVisible && <li>Product visible</li>}
                {r.requireLogoVisible && <li>Logo visible</li>}
                {r.requireCleanBackground && <li>Clean background</li>}
                {r.requireNoPeople && <li>No people</li>}
              </ul>
            </div>
            {r.requireAltText && (
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Accessibility</p>
                <p className="mt-1 text-muted-foreground">Alt text required</p>
              </div>
            )}
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Repair</p>
              <p className="mt-1 text-muted-foreground">
                {contract.repairPolicy.autoRepair ? "Automatic repair enabled" : "Manual repair"} ·{" "}
                {contract.repairPolicy.sendToReview ? "Human review enabled" : "No human review"} ·{" "}
                max {contract.repairPolicy.maxRepairAttempts} attempt{contract.repairPolicy.maxRepairAttempts === 1 ? "" : "s"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Build action */}
        <Card>
          <CardHeader>
            <CardTitle>Build</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Compile <span className="font-medium text-foreground">{selected?.name ?? "a master asset"}</span> against{" "}
              <span className="font-medium text-foreground">{contract.name}</span>. The compiler generates{" "}
              {contract.variants.length} variants, runs technical, visual and policy QA, repairs failures and
              releases only what passes.
            </p>
            <Button size="lg" onClick={onCompile} disabled={!selected || compile.isPending}>
              <Hammer /> {compile.isPending ? "QUEUEING…" : "COMPILE"}
            </Button>
            {!selected && <p className="text-xs text-muted-foreground">Select a source asset first.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        <ContractMapping maxSizeKb={r.maxSizeKb} />
        <ContractDiff contract={contract} builds={data?.builds ?? []} />
      </div>
    </div>
  );
}
