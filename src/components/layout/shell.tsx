"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileCheck2,
  Hammer,
  History,
  Images,
  Inbox,
  LayoutDashboard,
  Rocket,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useReviews } from "@/lib/api";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/contracts", label: "Contracts", icon: FileCheck2 },
  { href: "/assets", label: "Assets", icon: Images },
  { href: "/builds", label: "Builds", icon: Hammer },
  { href: "/review", label: "Review Queue", icon: Inbox },
  { href: "/releases", label: "Releases", icon: Rocket },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useReviews();
  const pending = data?.reviews.filter((r) => r.decision === "PENDING").length ?? 0;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-border bg-card md:flex">
        <div className="flex items-center gap-2 px-5 pb-4 pt-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.webp" alt="Media Compiler logo" width={112} height={72} className="h-9 w-auto" />
          <div>
            <p className="text-sm font-semibold tracking-tight">MEDIA COMPILER</p>
            <p className="text-[11px] text-muted-foreground">CI/CD for visual assets</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3" aria-label="Primary">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {item.href === "/review" && pending > 0 && (
                  <Badge variant="warning" className="ml-auto">{pending}</Badge>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-3">
          <Link
            href="/contracts"
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-3 md:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-mark.webp" alt="Media Compiler logo" width={84} height={54} className="h-7 w-auto" />
            <span className="text-sm font-semibold">MEDIA COMPILER</span>
          </div>
          <nav className="flex items-center gap-1 overflow-x-auto px-3 pb-2 md:hidden" aria-label="Mobile">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "whitespace-nowrap rounded-md px-3 py-1.5 text-sm",
                  (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href))
                    ? "bg-muted font-medium"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center justify-between px-6 py-3 md:flex">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <History className="h-4 w-4" />
              <span>workspace</span>
              <span className="text-border">/</span>
              <span className="font-medium text-foreground">production</span>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">{children}</main>
      </div>
    </div>
  );
}
