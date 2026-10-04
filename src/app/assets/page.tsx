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

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

export default function AssetsPage() {
  const { data, isLoading, isError, refetch } = useAssets();
  const assets = data?.assets ?? [];

  return (
    <div>
      <PageHeader
        title="Source Assets"
        description="Master media registered with the compiler. Upload a file directly, register by URL, or use the Upload Widget on any contract."
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
          description="Upload a file directly, register by URL, or use the Upload Widget on any contract."
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
  const [mode, setMode] = React.useState<"file" | "url">("file");
  const [file, setFile] = React.useState<File | null>(null);
  const [uploading, setUploading] = React.useState(false);
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

  const resetAll = () => {
    setOpen(false);
    setFile(null);
    setForm({ name: "", secureUrl: "", width: "", height: "", bytes: "", format: "jpg", altText: "" });
  };

  const registerUploaded = (info: Record<string, unknown>, fallbackName: string, alt: string) => {
    create.mutate(
      {
        name: String(info.original_filename ?? info.public_id ?? fallbackName),
        secureUrl: String(info.secure_url ?? ""),
        cloudinaryPublicId: String(info.public_id ?? ""),
        width: Number(info.width ?? 0),
        height: Number(info.height ?? 0),
        bytes: Number(info.bytes ?? 0),
        format: String(info.format ?? "jpg"),
        altText: alt.trim() === "" ? String(info.original_filename ?? fallbackName) : alt.trim(),
      },
      {
        onSuccess: () => {
          toast.success("Master asset uploaded to Cloudinary");
          resetAll();
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const uploadFile = async () => {
    if (!file) {
      toast.error("Choose an image file first");
      return;
    }
    if (!CLOUD_NAME || !UPLOAD_PRESET) {
      toast.error("Cloudinary upload preset is not configured - use URL mode instead");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("upload_preset", UPLOAD_PRESET);
      fd.append("tags", "media-compiler,source");
      const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error(`Upload failed (HTTP ${res.status})`);
      registerUploaded(await res.json(), file.name, form.altText);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

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
            Upload a file directly to Cloudinary, or point the compiler at an already-hosted file.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5" role="group" aria-label="Registration mode">
          {(["file", "url"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                mode === m
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "file" ? "Upload file" : "From URL"}
            </button>
          ))}
        </div>
        {mode === "file" ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ra-file">Image file</Label>
              <Input
                id="ra-file"
                type="file"
                accept="image/*"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-xs text-muted-foreground">
                {file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "JPG / PNG / WebP — metadata is read automatically."}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ra-alt-file">Alt text (optional)</Label>
              <Input id="ra-alt-file" value={form.altText} onChange={set("altText")} placeholder="Describe this image…" />
            </div>
            <Button onClick={uploadFile} disabled={uploading || create.isPending || !file} className="mt-1 w-full">
              {uploading ? "Uploading to Cloudinary…" : "Upload & Register"}
            </Button>
          </div>
        ) : (
        <>
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
        </>
        )}
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
