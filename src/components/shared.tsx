import { Badge } from "@/components/ui/badge";
import { BUILD_STATUS_LABEL, type BuildStatus, type QAStatus, type RuleSeverity } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<BuildStatus, "info" | "secondary" | "success" | "warning" | "danger" | "default"> = {
  QUEUED: "secondary",
  BUILDING: "info",
  ANALYZING: "info",
  TESTING: "info",
  REPAIRING: "warning",
  RETESTING: "warning",
  PASSED: "success",
  REVIEW_REQUIRED: "warning",
  FAILED: "danger",
  RELEASED: "default",
};

export function BuildStatusBadge({ status, className }: { status: BuildStatus; className?: string }) {
  const live = ["QUEUED", "BUILDING", "ANALYZING", "TESTING", "REPAIRING", "RETESTING"].includes(status);
  return (
    <Badge variant={STATUS_VARIANT[status]} className={className}>
      {live && <span className="building-dot inline-block h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {BUILD_STATUS_LABEL[status].toUpperCase()}
    </Badge>
  );
}

export function QAStatusBadge({ status }: { status: QAStatus }) {
  return (
    <Badge
      variant={status === "PASS" ? "success" : status === "FAIL" ? "danger" : status === "WARNING" ? "warning" : "secondary"}
    >
      {status}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: RuleSeverity }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0 font-mono text-[10px] font-semibold",
        severity === "BLOCK" && "bg-zinc-900 text-white",
        severity === "WARN" && "bg-amber-100 text-amber-800",
        severity === "INFO" && "bg-sky-100 text-sky-800",
      )}
      title={
        severity === "BLOCK"
          ? "Blocking: prevents release"
          : severity === "WARN"
            ? "Warning: ships visibly in the release report"
            : "Informational: recorded only"
      }
    >
      {severity}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <p className="font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4", className)}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
