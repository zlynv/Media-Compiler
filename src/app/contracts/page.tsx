"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/primitives";
import { EmptyState, PageHeader } from "@/components/shared";
import { useContracts } from "@/lib/api";

export default function ContractsPage() {
  const { data, isLoading, isError, refetch } = useContracts();
  const contracts = data?.contracts ?? [];

  return (
    <div>
      <PageHeader
        title="Media Contracts"
        description="Executable specifications every asset must satisfy."
        action={
          <Button asChild>
            <Link href="/contracts/new">
              <Plus /> New Contract
            </Link>
          </Button>
        }
      />
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-36 w-full" />
          ))}
        </div>
      ) : isError ? (
        <EmptyState
          title="Could not load contracts"
          description="The compiler API did not respond. Retry to reload your contracts."
          action={<Button onClick={() => refetch()}>Retry</Button>}
        />
      ) : contracts.length === 0 ? (
        <EmptyState
          title="No contracts yet"
          description="Create your first media contract to define how production assets should be built and tested."
          action={
            <Button asChild>
              <Link href="/contracts/new">
                <Plus /> Create Contract
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {contracts.map((c) => (
            <Link key={c.id} href={`/contracts/${c.id}`}>
              <Card className="transition-colors hover:border-foreground/30">
                <CardContent className="pt-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{c.description || "No description"}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>{c.status}</Badge>
                      <Badge variant="secondary">v{c.version}</Badge>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {c.variants.map((v) => (
                      <Badge key={v} variant="secondary">
                        {v}
                      </Badge>
                    ))}
                    <span className="ml-1 text-xs text-muted-foreground">
                      {c.variants.length} variants · {c.rules.maxSizeKb} KB max
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
