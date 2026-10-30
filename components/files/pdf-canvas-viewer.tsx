"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";

interface PdfCanvasViewerProps {
  url: string;
  title: string;
  scale?: number;
  rotation?: number;
  onLoaded?: (numPages: number) => void;
}

declare global {
  interface Window {
    pdfjsLib?: {
      GlobalWorkerOptions: {
        workerSrc: string;
      };
      getDocument: (src: string | { url: string }) => {
        promise: Promise<{
          numPages: number;
          getPage: (pageNumber: number) => Promise<{
            getViewport: (params: { scale: number; rotation?: number }) => {
              width: number;
              height: number;
            };
            render: (params: {
              canvasContext: CanvasRenderingContext2D;
              viewport: { width: number; height: number };
            }) => {
              promise: Promise<void>;
            };
          }>;
          destroy: () => Promise<void>;
        }>;
      };
    };
  }
}

export function PdfCanvasViewer({
  url,
  title,
  scale = 1,
  rotation = 0,
  onLoaded,
}: PdfCanvasViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [renderedCount, setRenderedCount] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeTaskRef = useRef<boolean>(true);

  useEffect(() => {
    activeTaskRef.current = true;

    let scriptElement: HTMLScriptElement | null = null;

    async function initPdfJs(): Promise<void> {
      if (window.pdfjsLib) {
        return;
      }

      return new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[src*="pdf.min.js"]') as HTMLScriptElement | null;
        if (existingScript) {
          if (window.pdfjsLib) {
            resolve();
            return;
          }
          existingScript.addEventListener("load", () => resolve());
          existingScript.addEventListener("error", () => reject(new Error("Failed to load PDF engine")));
          return;
        }

        const script = document.createElement("script");
        script.src = "/vendor/pdfjs/pdf.min.js";
        script.async = true;
        script.onload = () => {
          if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";
            resolve();
          } else {
            reject(new Error("PDF engine initialized without global export"));
          }
        };
        script.onerror = () => reject(new Error("Failed to load local PDF script"));
        document.head.appendChild(script);
        scriptElement = script;
      });
    }

    async function loadAndRenderPdf() {
      try {
        await initPdfJs();
        if (!activeTaskRef.current || !window.pdfjsLib) return;

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";

        const loadingTask = window.pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;

        if (!activeTaskRef.current) {
          pdf.destroy();
          return;
        }

        const pagesCount = pdf.numPages;
        setTotalPages(pagesCount);
        onLoaded?.(pagesCount);

        const container = containerRef.current;
        if (!container) return;

        // Clear previous canvas renders
        container.innerHTML = "";

        // High DPI multiplier (2x for retina sharpness without excessive memory use)
        const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2) : 1;

        for (let pageNum = 1; pageNum <= pagesCount; pageNum++) {
          if (!activeTaskRef.current) break;

          const page = await pdf.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });
          const renderViewport = page.getViewport({ scale: dpr * 1.5 });

          const pageWrapper = document.createElement("div");
          pageWrapper.className =
            "relative w-full flex flex-col items-center justify-center rounded-xl bg-white shadow-2xl overflow-hidden mb-6 last:mb-0 transition-transform duration-200";

          const canvas = document.createElement("canvas");
          canvas.width = renderViewport.width;
          canvas.height = renderViewport.height;
          canvas.className = "w-full h-auto block select-none";
          canvas.style.aspectRatio = `${baseViewport.width} / ${baseViewport.height}`;

          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) continue;

          pageWrapper.appendChild(canvas);
          container.appendChild(pageWrapper);

          await page.render({
            canvasContext: ctx,
            viewport: renderViewport,
          }).promise;

          if (activeTaskRef.current) {
            setRenderedCount(pageNum);
          }
        }

        if (activeTaskRef.current) {
          setLoading(false);
        }
      } catch (err) {
        if (activeTaskRef.current) {
          setError(err instanceof Error ? err.message : "Failed to render PDF pages");
          setLoading(false);
        }
      }
    }

    loadAndRenderPdf();

    return () => {
      activeTaskRef.current = false;
      if (scriptElement && scriptElement.parentNode) {
        // Keep script in head for caching across views
      }
    };
  }, [url, onLoaded]);

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Loading Skeleton & Progress */}
      {loading && (
        <div className="flex w-full flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 text-[#EFCE02] shadow-lg animate-pulse">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-white">
            {totalPages > 0
              ? `Rendering page ${renderedCount + 1} of ${totalPages}...`
              : "Loading document..."}
          </p>
          <p className="mt-1 text-xs text-zinc-400">Optimizing full resolution view for your device</p>
        </div>
      )}

      {/* Error Fallback */}
      {error && (
        <div className="my-8 flex max-w-md flex-col items-center rounded-2xl border border-red-900/50 bg-red-950/20 p-6 text-center text-red-200">
          <AlertCircle className="mb-3 h-8 w-8 text-red-400" />
          <h3 className="text-sm font-semibold">Unable to render PDF preview</h3>
          <p className="mt-1 text-xs text-red-300/80">{error}</p>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 rounded-xl bg-zinc-900 border border-zinc-800 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            Open Original PDF Directly
          </a>
        </div>
      )}

      {/* Rendered Canvas Pages Container */}
      <div
        ref={containerRef}
        className="w-full flex flex-col items-center transition-all duration-200 ease-out"
        style={{
          width: `${Math.round(scale * 100)}%`,
          maxWidth: scale === 1 ? "48rem" : `${Math.round(scale * 48)}rem`,
          transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: "center top",
        }}
        aria-label={title}
      />
    </div>
  );
}
