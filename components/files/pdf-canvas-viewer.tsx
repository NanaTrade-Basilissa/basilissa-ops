"use client";
/* eslint-disable @next/next/no-img-element */

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
  const [pages, setPages] = useState<string[]>([]);
  const renderRunIdRef = useRef(0);
  const onLoadedRef = useRef(onLoaded);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    let isCancelled = false;
    const currentRunId = ++renderRunIdRef.current;

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
      });
    }

    async function loadAndRenderPdf() {
      try {
        await initPdfJs();
        if (isCancelled || renderRunIdRef.current !== currentRunId || !window.pdfjsLib) return;

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.js";

        const loadingTask = window.pdfjsLib.getDocument({ url });
        const pdf = await loadingTask.promise;

        if (isCancelled || renderRunIdRef.current !== currentRunId) {
          pdf.destroy();
          return;
        }

        const pagesCount = pdf.numPages;
        setTotalPages(pagesCount);
        onLoadedRef.current?.(pagesCount);

        const renderedPages: string[] = [];

        for (let pageNum = 1; pageNum <= pagesCount; pageNum++) {
          if (isCancelled || renderRunIdRef.current !== currentRunId) break;

          const page = await pdf.getPage(pageNum);
          const baseViewport = page.getViewport({ scale: 1 });

          // Safe resolution scaling: Target ~1200px width for retina sharpness
          // Clamped strictly to avoid iOS Safari canvas memory limit (max 2048px width / 3000px height)
          let targetScale = Math.min(2.5, 1200 / Math.max(baseViewport.width, 1));
          if (baseViewport.height * targetScale > 3000) {
            targetScale = 3000 / baseViewport.height;
          }
          const renderViewport = page.getViewport({ scale: Math.max(1, targetScale) });

          // Create temporary offscreen canvas
          const canvas = document.createElement("canvas");
          canvas.width = Math.round(renderViewport.width);
          canvas.height = Math.round(renderViewport.height);

          const ctx = canvas.getContext("2d", { willReadFrequently: false });
          if (!ctx) continue;

          // Paint solid white background
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Render PDF page content
          await page.render({
            canvasContext: ctx,
            viewport: renderViewport,
          }).promise;

          if (isCancelled || renderRunIdRef.current !== currentRunId) {
            canvas.width = 0;
            canvas.height = 0;
            break;
          }

          // Convert rendered canvas into standard JPEG image element
          // This immediately frees iOS Safari GPU canvas memory and avoids blank white canvas bugs
          const imgUrl = canvas.toDataURL("image/jpeg", 0.9);

          // Release canvas backing store immediately
          canvas.width = 0;
          canvas.height = 0;

          renderedPages.push(imgUrl);
          if (!isCancelled && renderRunIdRef.current === currentRunId) {
            setPages([...renderedPages]);
          }
        }

        if (!isCancelled && renderRunIdRef.current === currentRunId) {
          setLoading(false);
        }
      } catch (err) {
        if (!isCancelled && renderRunIdRef.current === currentRunId) {
          setError(err instanceof Error ? err.message : "Failed to render PDF pages");
          setLoading(false);
        }
      }
    }

    loadAndRenderPdf();

    return () => {
      isCancelled = true;
    };
  }, [url, title]);

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Loading Skeleton & Progress */}
      {loading && pages.length === 0 && (
        <div className="flex w-full flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 border border-zinc-800 text-[#EFCE02] shadow-lg animate-pulse">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-white">
            {totalPages > 0
              ? `Rendering page ${pages.length + 1} of ${totalPages}...`
              : "Loading document..."}
          </p>
          <p className="mt-1 text-xs text-zinc-400">Rendering high-resolution pages for mobile</p>
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

      {/* Rendered React Image Pages Container (Zero duplicates guaranteed by React key reconciliation) */}
      <div
        className="w-full flex flex-col items-center transition-all duration-200 ease-out"
        style={{
          width: `${Math.round(scale * 100)}%`,
          maxWidth: scale === 1 ? "48rem" : `${Math.round(scale * 48)}rem`,
          transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: "center top",
        }}
        aria-label={title}
      >
        {pages.map((imgUrl, index) => (
          <div
            key={index}
            className="relative w-full flex flex-col items-center justify-center rounded-xl bg-white shadow-2xl overflow-hidden mb-6 last:mb-0"
          >
            <img
              src={imgUrl}
              alt={`${title} - Page ${index + 1} of ${totalPages || pages.length}`}
              className="w-full h-auto block select-none"
              draggable={false}
              decoding="async"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
