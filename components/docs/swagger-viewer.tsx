"use client";

import * as React from "react";
import "swagger-ui-dist/swagger-ui.css";

interface SwaggerViewerProps {
  spec?: Record<string, unknown>;
  specUrl?: string;
}

export function SwaggerViewer({ spec, specUrl = "/api/docs/openapi.json" }: SwaggerViewerProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    let isSubscribed = true;

    import("swagger-ui-dist").then((mod) => {
      if (!isSubscribed || !containerRef.current) return;

      const SwaggerUIBundle =
        mod.SwaggerUIBundle ||
        mod.default?.SwaggerUIBundle ||
        (window as unknown as { SwaggerUIBundle: unknown }).SwaggerUIBundle;

      const SwaggerUIStandalonePreset =
        mod.SwaggerUIStandalonePreset ||
        mod.default?.SwaggerUIStandalonePreset ||
        (window as unknown as { SwaggerUIStandalonePreset: unknown }).SwaggerUIStandalonePreset;

      if (typeof SwaggerUIBundle === "function") {
        SwaggerUIBundle({
          domNode: containerRef.current,
          ...(spec ? { spec } : { url: specUrl }),
          deepLinking: true,
          presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset,
          ].filter(Boolean),
          layout: "BaseLayout",
          docExpansion: "list",
          defaultModelsExpandDepth: 2,
          defaultModelExpandDepth: 2,
          displayRequestDuration: true,
          filter: true,
          showExtensions: true,
          showCommonExtensions: true,
          tryItOutEnabled: true,
        });

        setIsLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [spec, specUrl]);

  return (
    <div className="relative w-full min-h-[600px] bg-white rounded-2xl border border-border/50 shadow-none overflow-hidden p-2 sm:p-6">
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-muted-foreground gap-3">
          <div className="size-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm font-medium">Loading API Documentation...</p>
        </div>
      )}
      <div ref={containerRef} id="swagger-ui" className={isLoading ? "hidden" : "block"} />
    </div>
  );
}
