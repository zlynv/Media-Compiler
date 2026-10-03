"use client";

import * as React from "react";
import { Check, Plus } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EmptyState, PageHeader } from "@/components/shared";
import { useAssets, useCreateAsset, useUpdateAsset } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { SourceAsset } from "@/lib/types";

export default function AssetsPage() {
  const { data, isLoading, isError, refetch } = useAssets();
  const assets = data?.assets ?? [];

  return (
    <div>
      <PageHeader
        title="Source Assets"
        description="Master media registered with the compiler. Register by URL here, or upload via Cloudinary on any contract."
        action={<RegisterAssetDialog />}
      />
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Could not load assets"
          description="The compiler API did not respond. Retry to reload your source assets."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : assets.length === 0 ? (
        <EmptyState
          title="No source assets"
          description="Register one by URL, or upload through the Cloudinary widget on any contract."
          action={<RegisterAssetDialog />}
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {assets.map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function RegisterAssetDialog() {
  const create = useCreateAsset();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    name: "",
    secureUrl: "",
    width: "",
    height: "",
    bytes: "",
    format: "jpg",
    altText: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    create.mutate(
      {
        name: form.name.trim(),
        secureUrl: form.secureUrl.trim(),
        width: Number(form.width),
        height: Number(form.height),
        bytes: Number(form.bytes),
        format: form.format.trim() || "jpg",
        altText: form.altText.trim() === "" ? null : form.altText.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Source asset registered");
          setOpen(false);
          setForm({ name: "", secureUrl: "", width: "", height: "", bytes: "", format: "jpg", altText: "" });
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Register Asset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register source asset</DialogTitle>
          <DialogDescription>
            Point the compiler at an already-hosted file. For Cloudinary uploads with automatic
            metadata, use the Upload Widget on any contract instead.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="ra-name">Name</Label>
            <Input id="ra-name" value={form.name} onChange={set("name")} placeholder="campaign-hero.jpg" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="ra-url">File URL</Label>
            <Input id="ra-url" value={form.secureUrl} onChange={set("secureUrl")} placeholder="https://…" inputMode="url" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ra-width">Width (px)</Label>
            <Input id="ra-width" type="number" value={form.width} onChange={set("width")} placeholder="1920" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ra-height">Height (px)</Label>
            <Input id="ra-height" type="number" value={form.height} onChange={set("height")} placeholder="1280" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ra-bytes">Size (bytes)</Label>
            <Input id="ra-bytes" type="number" value={form.bytes} onChange={set("bytes")} placeholder="320000" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ra-format">Format</Label>
            <Input id="ra-format" value={form.format} onChange={set("format")} placeholder="jpg" />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label htmlFor="ra-alt">Alt text (optional)</Label>
            <Input id="ra-alt" value={form.altText} onChange={set("altText")} placeholder="Describe this image…" />
          </div>
        </div>
        <Button onClick={submit} disabled={create.isPending} className="mt-2 w-full">
          {create.isPending ? "Registering…" : "Register Asset"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function AssetCard({ asset: a }: { asset: SourceAsset }) {
  const update = useUpdateAsset();
  const [alt, setAlt] = React.useState(a.altText ?? "");
  const [editing, setEditing] = React.useState(false);
  const dirty = alt.trim() !== (a.altText ?? "");

  const save = () => {
    update.mutate(
      { id: a.id, altText: alt.trim() === "" ? null : alt.trim() },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success("Alt text saved - accessibility QA re-evaluates on next build");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <Card className="overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={a.previewUrl} alt={a.altText ?? a.name} className="aspect-square w-full object-cover" loading="lazy" />
      <CardContent className="pt-3">
        <p className="truncate text-sm font-medium">{a.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {formatBytes(a.bytes)} · {a.width} × {a.height}
        </p>
        <div className="mt-2 flex items-center justify-between">
          <Badge variant="secondary" className="uppercase">{a.format}</Badge>
          <Badge variant={a.altText ? "success" : "warning"}>{a.altText ? "alt ✓" : "no alt"}</Badge>
        </div>
        {editing ? (
          <div className="mt-2 flex gap-1.5">
            <Input
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              placeholder="Describe this image…"
              aria-label={`Alt text for ${a.name}`}
              className="h-8 text-xs"
            />
            <Button size="sm" onClick={save} disabled={!dirty || update.isPending} aria-label="Save alt text">
              <Check />
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-2 block w-full truncate rounded-md px-1 py-1 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            title={a.altText ?? "Add alt text"}
          >
            {a.altText ? `“${a.altText}”` : "Add alt text…"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
