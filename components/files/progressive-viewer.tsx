"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Download,
  Eye,
  FileText,
  Maximize2,
  Minimize2,
  RotateCw,
  RotateCcw,
  Share2,
  ZoomIn,
  ZoomOut,
  Check,
  LayoutTemplate,
} from "lucide-react";
import type { HostedFileItem } from "@/lib/modules/files/constants";
import { PdfCanvasViewer } from "@/components/files/pdf-canvas-viewer";

interface ProgressiveViewerProps {
  file: HostedFileItem;
  highResUrl: string;
  lowResUrl: string | null;
  initialMode?: "branded" | "page";
}

export function ProgressiveViewer({
  file,
  highResUrl,
  lowResUrl,
  initialMode,
}: ProgressiveViewerProps) {
  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf";

  const defaultMode =
    initialMode ?? (file.displayMode === "RENDER_AS_PAGE" ? "page" : "branded");
  const [viewMode, setViewMode] = useState<"branded" | "page">(defaultMode);

  const [isHighResLoaded, setIsHighResLoaded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Zoom & Scale state
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const isPinchingRef = useRef(false);
  const startDistanceRef = useRef(0);
  const startScaleRef = useRef(1);
  const lastTapTimeRef = useRef(0);

  // Background preload for high-res asset
  useEffect(() => {
    let active = true;

    if (isImage) {
      const img = new window.Image();
      img.src = highResUrl;
      img.onload = () => {
        if (active) setIsHighResLoaded(true);
      };
      img.onerror = () => {
        if (active) setIsHighResLoaded(true);
      };
    }

    return () => {
      active = false;
    };
  }, [highResUrl, isImage]);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Zoom manipulation helpers
  const handleZoomIn = useCallback(() => {
    setScale((s) => Math.min(3, +(s + 0.25).toFixed(2)));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => Math.max(1, +(s - 0.25).toFixed(2)));
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setRotation(0);
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
  }, []);

  // Multi-touch gestures (2-finger pinch-to-zoom + double-tap)
  // Single finger touches are untouched so native vertical document scrolling is 100% fluid
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // 2 fingers: pinch gesture
      isPinchingRef.current = true;
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      startDistanceRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      startScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      // Single finger: detect double tap to toggle zoom
      const now = Date.now();
      const timeDiff = now - lastTapTimeRef.current;
      lastTapTimeRef.current = now;

      if (timeDiff < 300) {
        setScale((s) => (s > 1 ? 1 : 1.75));
      }
    }
  };

  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (isPinchingRef.current && e.touches.length === 2) {
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);

      if (startDistanceRef.current > 0) {
        const factor = currentDist / startDistanceRef.current;
        const newScale = Math.min(3, Math.max(1, +(startScaleRef.current * factor).toFixed(2)));
        setScale(newScale);
      }
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      isPinchingRef.current = false;
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore
    }
  };

  const formattedSize =
    file.fileSize > 1024 * 1024
      ? `${(file.fileSize / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.round(file.fileSize / 1024)} KB`;

  // ==========================================
  // MODE 1: "Render as a Page" (Clean Full Screen Document View)
  // - Vertically scrollable across ALL pages with native momentum
  // - Clean fit width on initial load (no oversized cropping)
  // - Physical zoom buttons (+ / - / reset to fit)
  // - 2-finger pinch-to-zoom + double-tap zoom
  // - NO header, NO footer, NO floating viewer controls button
  // ==========================================
  if (viewMode === "page") {
    return (
      <div
        ref={containerRef}
        className="relative min-h-screen w-full bg-zinc-950 font-sans text-zinc-100 antialiased overflow-y-auto overflow-x-auto selection:bg-[#EFCE02] selection:text-black"
        style={{
          touchAction: "pan-x pan-y pinch-zoom",
        }}
      >
        {/* Main Scrollable Canvas */}
        <div
          ref={viewportRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="min-h-screen w-full flex flex-col items-center justify-start py-6 px-3 sm:px-6 pb-28"
        >
          {isImage && (
            <div
              className="relative flex flex-col items-center justify-start transition-all duration-200 ease-out select-none"
              style={{
                width: `${Math.round(scale * 100)}%`,
                maxWidth: scale === 1 ? "48rem" : `${Math.round(scale * 48)}rem`,
                transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
                transformOrigin: "center top",
              }}
            >
              {/* Instant low-res preview */}
              {lowResUrl && (
                <img
                  src={lowResUrl}
                  alt={file.title}
                  fetchPriority="high"
                  decoding="async"
                  draggable={false}
                  className={`w-full h-auto object-contain rounded-lg shadow-2xl transition-opacity duration-300 pointer-events-none select-none ${
                    isHighResLoaded ? "opacity-0 absolute inset-0" : "opacity-100 blur-[0.5px]"
                  }`}
                />
              )}

              {/* High-res asset (fitted to screen width & scrollable vertically for all pages) */}
              <img
                src={highResUrl}
                alt={file.title}
                fetchPriority={lowResUrl ? "auto" : "high"}
                decoding="async"
                draggable={false}
                onLoad={() => setIsHighResLoaded(true)}
                className={`w-full h-auto object-contain rounded-lg shadow-2xl transition-opacity duration-300 select-none ${
                  isHighResLoaded || !lowResUrl ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"
                }`}
              />
            </div>
          )}

          {isPdf && (
            <PdfCanvasViewer
              url={highResUrl}
              title={file.title}
              scale={scale}
              rotation={rotation}
              onLoaded={() => setIsHighResLoaded(true)}
            />
          )}

          {!isImage && !isPdf && (
            <div className="flex min-h-[80vh] w-full items-center justify-center p-4">
              <div className="flex max-w-md flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800 text-[#EFCE02]">
                  <FileText className="h-10 w-10" />
                </div>
                <h2 className="text-lg font-semibold text-white">{file.title}</h2>
                <p className="mt-1 text-sm text-zinc-400">{file.originalFilename}</p>
                <a
                  href={highResUrl}
                  download={file.originalFilename}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#EFCE02] px-5 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-[#FFE300] active:scale-95 shadow-md"
                >
                  <Download className="h-4 w-4" />
                  Download Document
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Physical Zoom Controls (Docked sleekly at bottom center for easy thumb access) */}
        {(isImage || isPdf) && (
          <div className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/90 px-3 py-1.5 shadow-2xl backdrop-blur-md">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={scale <= 1}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-30 active:scale-95"
              aria-label="Zoom Out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={handleResetZoom}
              className="px-2 text-xs font-mono font-medium text-zinc-300 hover:text-[#EFCE02] transition-colors"
              title="Reset to 100% fit width"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 3}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-30 active:scale-95"
              aria-label="Zoom In"
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            <div className="mx-1 h-3.5 w-px bg-zinc-800" />

            <button
              type="button"
              onClick={handleRotate}
              className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white active:scale-95"
              aria-label="Rotate 90 degrees"
              title="Rotate 90°"
            >
              <RotateCw className="h-4 w-4" />
            </button>

            {scale > 1 && (
              <button
                type="button"
                onClick={handleResetZoom}
                className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-[#EFCE02] active:scale-95"
                title="Reset zoom to 100% fit width"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // MODE 2: In-App Viewer (Branded Basilissa Mode)
  // Header with official Logo, Primary Yellow color,
  // controls, and "Render as Page" action
  // ==========================================
  return (
    <div
      ref={containerRef}
      className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100 antialiased selection:bg-[#EFCE02] selection:text-black"
    >
      {/* Top Header / Basilissa Brand Bar */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-zinc-900 shadow-sm border border-zinc-800">
            <img
              src="/bsa-logo-icon.png"
              alt="Basilissa"
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex flex-col">
            <span className="line-clamp-1 max-w-[180px] text-sm font-semibold tracking-tight text-white sm:max-w-md md:max-w-xl">
              {file.title}
            </span>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                {file.mimeType.split("/")[1]?.toUpperCase() ?? "FILE"}
              </span>
              <span>&middot;</span>
              <span>{formattedSize}</span>
              <span>&middot;</span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {file.viewsCount + 1} views
              </span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Render as a Page user action */}
          <button
            type="button"
            onClick={() => setViewMode("page")}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
            title="Render file full-page without header or footer"
          >
            <LayoutTemplate className="h-4 w-4 text-[#EFCE02]" />
            <span className="hidden sm:inline">Render as a Page</span>
          </button>

          {(isImage || isPdf) && (
            <div className="hidden items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1 sm:flex">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={scale <= 1}
                className="rounded p-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40"
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2 text-xs font-mono text-zinc-400 hover:text-white"
                title="Reset Zoom"
              >
                {Math.round(scale * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={scale >= 3}
                className="rounded p-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-40"
                title="Zoom In"
                aria-label="Zoom In"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <div className="mx-1 h-3 w-px bg-zinc-700" />
              <button
                type="button"
                onClick={handleRotate}
                className="rounded p-1.5 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                title="Rotate 90 degrees"
                aria-label="Rotate"
              >
                <RotateCw className="h-4 w-4" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-lg border border-zinc-800 bg-zinc-900/90 p-2 text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/90 px-3 py-2 text-xs font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
            title="Copy Public Link"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Share2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{copied ? "Copied" : "Share"}</span>
          </button>

          <a
            href={highResUrl}
            download={file.originalFilename}
            className="flex items-center gap-1.5 rounded-lg bg-[#EFCE02] px-3.5 py-2 text-xs font-bold text-zinc-950 transition-all hover:bg-[#FFE300] active:scale-95 shadow-sm"
            title="Download original file"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </a>
        </div>
      </header>

      {/* Main Viewing Canvas */}
      <main className="relative flex flex-1 flex-col items-center justify-start overflow-y-auto overflow-x-auto p-4 sm:p-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Image Mode */}
        {isImage && (
          <div
            className="w-full max-w-3xl flex flex-col items-center my-auto transition-all duration-200 ease-out select-none"
            style={{
              width: `${Math.round(scale * 100)}%`,
              maxWidth: scale === 1 ? "48rem" : `${Math.round(scale * 48)}rem`,
              transform: rotation !== 0 ? `rotate(${rotation}deg)` : undefined,
              transformOrigin: "center top",
            }}
          >
            {lowResUrl && (
              <img
                src={lowResUrl}
                alt={file.title}
                fetchPriority="high"
                decoding="async"
                className={`w-full h-auto rounded-lg object-contain shadow-2xl transition-opacity duration-300 pointer-events-none select-none ${
                  isHighResLoaded ? "opacity-0 absolute inset-0" : "opacity-100 blur-[0.5px]"
                }`}
              />
            )}

            <img
              src={highResUrl}
              alt={file.title}
              fetchPriority={lowResUrl ? "auto" : "high"}
              decoding="async"
              onLoad={() => setIsHighResLoaded(true)}
              className={`w-full h-auto rounded-lg object-contain shadow-2xl transition-opacity duration-300 select-none ${
                isHighResLoaded || !lowResUrl ? "opacity-100" : "opacity-0 absolute inset-0 pointer-events-none"
              }`}
            />
          </div>
        )}

        {/* PDF Mode (Rendered onto canvas pages so all pages scroll smoothly) */}
        {isPdf && (
          <div className="w-full max-w-4xl flex flex-col items-center my-4">
            <PdfCanvasViewer
              url={highResUrl}
              title={file.title}
              scale={scale}
              rotation={rotation}
              onLoaded={() => setIsHighResLoaded(true)}
            />
          </div>
        )}

        {/* Document / Other */}
        {!isImage && !isPdf && (
          <div className="flex max-w-md flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800 text-[#EFCE02]">
              <FileText className="h-10 w-10" />
            </div>
            <h2 className="text-lg font-semibold text-white">{file.title}</h2>
            <p className="mt-1 text-sm text-zinc-400">{file.originalFilename}</p>
            <div className="mt-4 flex items-center gap-3 text-xs text-zinc-500">
              <span>{formattedSize}</span>
              <span>&middot;</span>
              <span>{file.mimeType}</span>
            </div>
            <a
              href={highResUrl}
              download={file.originalFilename}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#EFCE02] px-5 py-3 text-sm font-bold text-zinc-950 transition-all hover:bg-[#FFE300] active:scale-95"
            >
              <Download className="h-4 w-4" />
              Download Document
            </a>
          </div>
        )}
      </main>

      {/* Bottom Status Indicator */}
      <footer className="flex h-9 items-center justify-between border-t border-zinc-800/60 bg-zinc-950 px-4 text-[11px] text-zinc-500 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          <span>
            {isHighResLoaded
              ? "High-Resolution Rendered"
              : lowResUrl
                ? "Fast Preview Loaded · Optimizing high-res in background..."
                : "Rendering Asset..."}
          </span>
        </div>
        <div className="text-zinc-600">Basilissa Portal</div>
      </footer>
    </div>
  );
}
