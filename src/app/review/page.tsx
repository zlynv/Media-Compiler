"use client";

import Link from "next/link";
import * as React from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Skeleton,
} from "@/components/ui/primitives";
import { EmptyState, PageHeader } from "@/components/shared";
import { useDecideReview, useReviews } from "@/lib/api";

export default function ReviewPage() {
  const { data, isLoading, isError, refetch } = useReviews();
  const decide = useDecideReview();
  const reviews = data?.reviews ?? [];
  const pending = reviews.filter((r) => r.decision === "PENDING");

  const onDecide = (reviewId: string, decision: "APPROVED" | "REJECTED") => {
    decide.mutate(
      { reviewId, decision },
      {
        onSuccess: () => toast.success(decision === "APPROVED" ? "Asset approved" : "Asset rejected"),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  return (
    <div>
      <PageHeader
        title="Human Review Queue"
        description="Automate what can be automated - escalate what cannot."
      />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : isError ? (
        <EmptyState
          title="Could not load the review queue"
          description="The compiler API did not respond. Retry to reload pending reviews."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : reviews.length === 0 ? (
        <EmptyState
          title="Review queue is empty"
          description="Unrepairable failures will appear here with the AI confidence and a suggested action."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {pending.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {pending.length} asset{pending.length === 1 ? "" : "s"} need{pending.length === 1 ? "s" : ""} human review
            </p>
          )}
          {reviews.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.previewUrl} alt={r.assetName} className="h-20 w-20 shrink-0 rounded-lg border border-border object-cover" loading="lazy" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-mono text-sm font-semibold">{r.assetName}</p>
                    <Badge variant={r.decision === "PENDING" ? "warning" : r.decision === "APPROVED" ? "success" : "danger"}>
                      {r.decision}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-sm">{r.issue}</p>
                  <p className="text-xs text-muted-foreground">{r.reason}</p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">AI confidence {r.confidence}% · Suggested: {r.suggestedAction}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">Review</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Review asset</DialogTitle>
                        <DialogDescription>
                          Build <Link href={`/builds/${r.buildId}`} className="font-mono underline">details</Link> · decide whether this asset can ship.
                        </DialogDescription>
                      </DialogHeader>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={r.previewUrl} alt={r.assetName} className="max-h-72 w-full rounded-lg border border-border object-contain" />
                      <div className="rounded-lg bg-muted/60 p-3 text-sm">
                        <p><span className="font-medium">Failure: </span>{r.issue}</p>
                        <p className="mt-1"><span className="font-medium">AI confidence: </span>{r.confidence}%</p>
                        <p className="mt-1"><span className="font-medium">Suggested action: </span>{r.suggestedAction}</p>
                      </div>
                      {r.decision === "PENDING" ? (
                        <div className="flex gap-2">
                          <Button size="sm" onClick={() => onDecide(r.id, "APPROVED")} disabled={decide.isPending}>
                            <Check /> Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => onDecide(r.id, "REJECTED")} disabled={decide.isPending}>
                            <X /> Reject
                          </Button>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Decision recorded: {r.decision}</p>
                      )}
                    </DialogContent>
                  </Dialog>
                  {r.decision === "PENDING" && (
                    <>
                      <Button size="sm" onClick={() => onDecide(r.id, "APPROVED")} disabled={decide.isPending}>
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => onDecide(r.id, "REJECTED")} disabled={decide.isPending}>
                        Reject
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
