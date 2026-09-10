import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Code2, Download, ExternalLink } from "lucide-react";
import { OPENAPI_SPEC } from "@/lib/platform/openapi-spec";
import { SwaggerViewer } from "@/components/docs/swagger-viewer";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "API Documentation | Basilissa Operations Platform",
  description: "Interactive Swagger API documentation for Basilissa Operations Platform.",
};

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1.5 text-xs text-muted-foreground hover:text-foreground",
              )}
            >
              <ArrowLeft className="size-3.5" /> Dashboard
            </Link>
            <span className="h-4 w-px bg-border/60" />
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Code2 className="size-4" />
              </span>
              <div>
                <h1 className="font-heading text-sm font-bold tracking-tight text-foreground">
                  Basilissa Operations API
                </h1>
                <p className="text-[11px] text-muted-foreground">OpenAPI 3.0.3 Specification</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="/api/docs/openapi.json"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "outline", size: "sm" }),
                "gap-1.5 text-xs bg-card",
              )}
            >
              <Download className="size-3.5" /> OpenAPI JSON
            </a>
            <a
              href="/api/health"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-1 text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex",
              )}
            >
              Healthcheck <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <SwaggerViewer spec={OPENAPI_SPEC as unknown as Record<string, unknown>} />
      </main>
    </div>
  );
}
