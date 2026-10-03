"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/controls";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Separator, Skeleton } from "@/components/ui/primitives";
import { PageHeader } from "@/components/shared";
import { DEFAULT_CONTRACT_INPUT, CONTRACT_PRESETS, contractInputSchema, type ContractFormValues } from "@/lib/contracts";
import { useContract, useCreateContract, useUpdateContract } from "@/lib/api";
import type { AllowedFormat, RuleSeverity, Variant } from "@/lib/types";

const VARIANTS: Variant[] = ["1:1", "4:5", "16:9"];
const FORMATS: AllowedFormat[] = ["webp", "avif", "jpeg"];
const SEVERITIES: RuleSeverity[] = ["BLOCK", "WARN", "INFO"];
const SEVERITY_RULES = [
  "Product visible",
  "Logo visible",
  "Clean background",
  "No visible people",
  "No prohibited content",
  "No visible personal information",
  "Alt text present",
  "Maximum file size",
] as const;

function CheckRow({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 hover:bg-muted/50">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} className="mt-0.5" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

export default function NewContractPage() {
  return (
    <React.Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <ContractForm />
    </React.Suspense>
  );
}

function ContractForm() {
  const editId = useSearchParams().get("edit");
  const { data: existing, isLoading: loadingExisting } = useContract(editId ?? "");
  const existingContract = editId ? existing?.contract : undefined;
  if (editId && !existingContract && !loadingExisting) {
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Edit Media Contract" description="This contract does not exist." />
      </div>
    );
  }
  if (editId && !existingContract) {
    return (
      <div className="mx-auto max-w-2xl">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="mt-4 h-96 w-full" />
      </div>
    );
  }
  // Output values previously passed the schema, so they are valid form inputs.
  const initial = (existingContract
    ? {
        name: existingContract.name,
        description: existingContract.description,
        variants: [...existingContract.variants],
        rules: {
          ...existingContract.rules,
          allowedFormats: [...existingContract.rules.allowedFormats],
        },
        repairPolicy: { ...existingContract.repairPolicy },
      }
    : DEFAULT_CONTRACT_INPUT) as ContractFormValues;
  // Remount on contract load so defaultValues apply exactly once.
  return <ContractFields key={editId ?? "new"} initial={initial} editId={editId} currentVersion={existingContract?.version} />;
}

function ContractFields({
  initial,
  editId,
  currentVersion,
}: {
  initial: ContractFormValues;
  editId: string | null;
  currentVersion?: number;
}) {
  const router = useRouter();
  const create = useCreateContract();
  const update = useUpdateContract(editId ?? "");
  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractInputSchema),
    defaultValues: initial,
  });
  const { register, handleSubmit, watch, setValue, reset, formState } = form;
  const values = watch();

  const toggleList = <T,>(list: T[], item: T): T[] =>
    list.includes(item) ? list.filter((x) => x !== item) : [...list, item];

  const onSubmit = (raw: ContractFormValues) => {
    const parsed = contractInputSchema.safeParse(raw);
    if (!parsed.success) {
      toast.error("Please fix the highlighted fields");
      return;
    }
    if (editId) {
      update.mutate(parsed.data, {
        onSuccess: (res) => {
          toast.success(`Contract saved as v${res.contract.version} - existing builds keep their pinned snapshot`);
          router.push(`/contracts/${res.contract.id}`);
        },
        onError: (e) => toast.error(e.message),
      });
      return;
    }
    create.mutate(parsed.data, {
      onSuccess: (res) => {
        toast.success("Contract saved");
        router.push(`/contracts/${res.contract.id}`);
      },
      onError: (e) => toast.error(e.message),
    });
  };

  const saving = create.isPending || update.isPending;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title={editId ? `Edit Media Contract${currentVersion ? ` v${currentVersion}` : ""}` : "Create Media Contract"}
        description={
          editId
            ? "Saving creates a new contract version. Existing builds keep the snapshot they compiled against."
            : "Define what every asset built from this contract must satisfy."
        }
      />
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Start from a preset</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {CONTRACT_PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  title={p.source}
                  onClick={() => {
                    reset(p.input);
                    toast.success(`${p.name} preset applied`);
                  }}
                  className="rounded-md border border-input px-3.5 py-1.5 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-muted/60"
                >
                  {p.name}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Presets populate documented rule sets - adjust anything before saving. Hover a preset for its source.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="Diwali 2026 Campaign" {...register("name")} />
              {formState.errors.name && <p className="text-xs text-red-600">{formState.errors.name.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Production requirements for campaign assets" {...register("description")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Required Variants</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {VARIANTS.map((v) => (
                <label
                  key={v}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-colors ${
                    values.variants.includes(v) ? "border-primary bg-muted" : "border-input"
                  }`}
                >
                  <Checkbox
                    checked={values.variants.includes(v)}
                    onCheckedChange={() => setValue("variants", toggleList(values.variants, v), { shouldValidate: true })}
                  />
                  {v}
                </label>
              ))}
            </div>
            {formState.errors.variants && <p className="mt-2 text-xs text-red-600">{formState.errors.variants.message}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Technical Rules</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="minWidth">Minimum width</Label>
                <Input id="minWidth" type="number" {...register("rules.minWidth")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="minHeight">Minimum height</Label>
                <Input id="minHeight" type="number" {...register("rules.minHeight")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxSizeKb">Max file size (KB)</Label>
                <Input id="maxSizeKb" type="number" {...register("rules.maxSizeKb")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxWidth">Maximum width <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="maxWidth" type="number" placeholder="No limit" {...register("rules.maxWidth")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxHeight">Maximum height <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="maxHeight" type="number" placeholder="No limit" {...register("rules.maxHeight")} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxMegapixels">Max megapixels <span className="font-normal text-muted-foreground">(optional)</span></Label>
                <Input id="maxMegapixels" type="number" step="0.1" placeholder="No limit" {...register("rules.maxMegapixels")} />
              </div>
            </div>
            <div>
              <Label>Allowed formats</Label>
              <div className="mt-2 flex gap-2">
                {FORMATS.map((f) => (
                  <label
                    key={f}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium uppercase transition-colors ${
                      values.rules.allowedFormats.includes(f) ? "border-primary bg-muted" : "border-input"
                    }`}
                  >
                    <Checkbox
                      checked={values.rules.allowedFormats.includes(f)}
                      onCheckedChange={() =>
                        setValue("rules.allowedFormats", toggleList(values.rules.allowedFormats, f), { shouldValidate: true })
                      }
                    />
                    {f}
                  </label>
                ))}
              </div>
              {formState.errors.rules?.allowedFormats && (
                <p className="mt-2 text-xs text-red-600">{formState.errors.rules.allowedFormats.message}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Visual Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckRow checked={values.rules.requireProductVisible} onChange={(v) => setValue("rules.requireProductVisible", v)} label="Product must be visible" />
            <CheckRow checked={values.rules.requireLogoVisible} onChange={(v) => setValue("rules.requireLogoVisible", v)} label="Logo must be visible" />
            <CheckRow checked={values.rules.requireCleanBackground} onChange={(v) => setValue("rules.requireCleanBackground", v)} label="Clean background" />
            <CheckRow checked={values.rules.requireNoPeople} onChange={(v) => setValue("rules.requireNoPeople", v)} label="No visible people" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Policy Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckRow checked={values.rules.requireNoProhibitedContent} onChange={(v) => setValue("rules.requireNoProhibitedContent", v)} label="No prohibited content" />
            <CheckRow checked={values.rules.requireNoPersonalInfo} onChange={(v) => setValue("rules.requireNoPersonalInfo", v)} label="No visible personal information" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accessibility</CardTitle>
          </CardHeader>
          <CardContent>
            <CheckRow checked={values.rules.requireAltText} onChange={(v) => setValue("rules.requireAltText", v)} label="Alt text required" hint="Every asset must carry alternative text for screen readers. Missing alt text cannot be auto-repaired." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Repair Policy</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CheckRow checked={values.repairPolicy.autoRepair} onChange={(v) => setValue("repairPolicy.autoRepair", v)} label="Auto-repair when safe" hint="Apply Cloudinary transformations automatically for repairable failures." />
            <CheckRow checked={values.repairPolicy.retestAfterRepair} onChange={(v) => setValue("repairPolicy.retestAfterRepair", v)} label="Re-test repaired assets" hint="Re-run the full QA suite after every repair." />
            <CheckRow checked={values.repairPolicy.sendToReview} onChange={(v) => setValue("repairPolicy.sendToReview", v)} label="Send unresolved failures to review" hint="Escalate anything that cannot be safely repaired." />
            <div className="flex max-w-55 flex-col gap-1.5">
              <Label htmlFor="maxRepairAttempts">Max repair attempts per artifact</Label>
              <Input id="maxRepairAttempts" type="number" min={1} max={5} {...register("repairPolicy.maxRepairAttempts")} />
              <p className="text-xs text-muted-foreground">Exhausted budgets escalate to human review - repairs never loop forever.</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Rule Severity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1.5">
            <p className="text-xs text-muted-foreground">
              BLOCK prevents release. WARN ships visibly in the release report. INFO is recorded only. Unlisted rules default to BLOCK.
            </p>
            {SEVERITY_RULES.map((rule) => {
              const current = (values.rules.severity as Record<string, RuleSeverity> | undefined)?.[rule] ?? "BLOCK";
              return (
                <div key={rule} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5">
                  <span className="text-sm font-medium">{rule}</span>
                  <div className="flex gap-1" role="group" aria-label={`${rule} severity`}>
                    {SEVERITIES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        aria-pressed={current === s}
                        onClick={() => setValue("rules.severity", { ...(values.rules.severity ?? {}), [rule]: s }, { shouldValidate: true })}
                        className={`rounded px-2 py-0.5 font-mono text-[11px] font-semibold transition-colors ${
                          current === s
                            ? s === "BLOCK"
                              ? "bg-zinc-900 text-white"
                              : s === "WARN"
                                ? "bg-amber-400 text-zinc-950"
                                : "bg-sky-200 text-sky-900"
                            : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Separator />
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Saving…" : editId ? "Save New Version" : "Save Contract"}
        </Button>
      </form>
    </div>
  );
}
