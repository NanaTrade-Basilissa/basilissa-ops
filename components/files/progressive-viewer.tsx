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

  // Pan & Zoom gesture state
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);

  const viewportRef = useRef<HTMLDivElement>(null);
  const isPinchingRef = useRef(false);
  const isDraggingRef = useRef(false);
  const startDistanceRef = useRef(0);
  const startScaleRef = useRef(1);
  const startPosRef = useRef({ x: 0, y: 0 });
  const startTranslateRef = useRef({ x: 0, y: 0 });
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
    setScale((s) => Math.min(5, +(s + 0.5).toFixed(2)));
  }, []);

  const handleZoomOut = useCallback(() => {
    setScale((s) => {
      const next = Math.max(1, +(s - 0.5).toFixed(2));
      if (next <= 1) {
        setTranslate({ x: 0, y: 0 });
      }
      return next;
    });
  }, []);

  const handleResetZoom = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setRotation(0);
  }, []);

  const handleRotate = useCallback(() => {
    setRotation((r) => (r + 90) % 360);
  }, []);

  // Native non-passive touchmove listener to avoid iOS Safari page bounce & native conflict
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const preventDefaultTouch = (e: TouchEvent) => {
      if (e.touches.length === 2 || scale > 1) {
        if (e.cancelable) {
          e.preventDefault();
        }
      }
    };

    el.addEventListener("touchmove", preventDefaultTouch, { passive: false });
    return () => {
      el.removeEventListener("touchmove", preventDefaultTouch);
    };
  }, [scale]);

  // Touch handlers for 2-finger pinch-to-zoom and 1-finger pan
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      // 2 fingers: pinch-to-zoom gesture
      isPinchingRef.current = true;
      isDraggingRef.current = false;
      const t1 = e.touches[0]!;
      const t2 = e.touches[1]!;
      startDistanceRef.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      startScaleRef.current = scale;
    } else if (e.touches.length === 1) {
      // 1 finger: pan if zoomed in, or detect double tap
      const now = Date.now();
      const timeDiff = now - lastTapTimeRef.current;
      lastTapTimeRef.current = now;

      if (timeDiff < 300) {
        // Double tap: toggle between 1x (fit) and 2.5x zoom
        if (scale > 1) {
          handleResetZoom();
        } else {
          setScale(2.5);
        }
        return;
      }

      if (scale > 1) {
        isDraggingRef.current = true;
        const t = e.touches[0]!;
        startPosRef.current = { x: t.clientX, y: t.clientY };
        startTranslateRef.current = { ...translate };
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
        const newScale = Math.min(5, Math.max(1, +(startScaleRef.current * factor).toFixed(2)));
        setScale(newScale);
        if (newScale <= 1) {
          setTranslate({ x: 0, y: 0 });
        }
      }
    } else if (isDraggingRef.current && e.touches.length === 1 && scale > 1) {
      const t = e.touches[0]!;
      const deltaX = t.clientX - startPosRef.current.x;
      const deltaY = t.clientY - startPosRef.current.y;

      setTranslate({
        x: startTranslateRef.current.x + deltaX,
        y: startTranslateRef.current.y + deltaY,
      });
    }
  };

  const onTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length < 2) {
      isPinchingRef.current = false;
    }
    if (e.touches.length === 0) {
      isDraggingRef.current = false;
      if (scale <= 1) {
        setTranslate({ x: 0, y: 0 });
      }
    }
  };

  // Desktop mouse drag handlers when zoomed in
  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (scale > 1 && e.button === 0) {
      isDraggingRef.current = true;
      startPosRef.current = { x: e.clientX, y: e.clientY };
      startTranslateRef.current = { ...translate };
    }
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isDraggingRef.current && scale > 1) {
      const deltaX = e.clientX - startPosRef.current.x;
      const deltaY = e.clientY - startPosRef.current.y;
      setTranslate({
        x: startTranslateRef.current.x + deltaX,
        y: startTranslateRef.current.y + deltaY,
      });
    }
  };

  const onMouseUp = () => {
    isDraggingRef.current = false;
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
  // MODE 1: "Render as a Page" (Full Screen Mobile Experience)
  // - Entire image fitted properly on screen on initial load
  // - Physical zoom buttons (+ / - / reset)
  // - 2-finger pinch-to-zoom + 1-finger pan
  // - Double-tap zoom
  // - Viewer controls button HIDDEN
  // ==========================================
  if (viewMode === "page") {
    return (
      <div
        ref={containerRef}
        className="relative min-h-[100dvh] w-full bg-zinc-950 font-sans text-zinc-100 antialiased overflow-hidden selection:bg-[#EFCE02] selection:text-black touch-none"
      >
        {/* Main Pan/Zoom Canvas */}
        <div
          ref={viewportRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={onMouseUp}
          onMouseLeave={onMouseUp}
          className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden"
          style={{
            cursor: scale > 1 ? "grab" : "default",
          }}
        >
          {isImage && (
            <div
              className="relative flex max-h-[100dvh] max-w-full items-center justify-center transition-transform duration-75 ease-out select-none will-change-transform"
              style={{
                transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale(${scale}) rotate(${rotation}deg)`,
                transformOrigin: "center center",
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
                  className={`max-h-[100dvh] max-w-[100vw] w-auto h-auto object-contain transition-opacity duration-300 pointer-events-none select-none ${
                    isHighResLoaded ? "opacity-0 absolute" : "opacity-100 blur-[0.5px]"
                  }`}
                />
              )}

              {/* High-res asset (fitted to screen width & height on 1x) */}
              <img
                src={highResUrl}
                alt={file.title}
                fetchPriority={lowResUrl ? "auto" : "high"}
                decoding="async"
                draggable={false}
                onLoad={() => setIsHighResLoaded(true)}
                className={`max-h-[100dvh] max-w-[100vw] w-auto h-auto object-contain transition-opacity duration-300 select-none ${
                  isHighResLoaded || !lowResUrl ? "opacity-100" : "opacity-0 absolute pointer-events-none"
                }`}
              />
            </div>
          )}

          {isPdf && (
            <div className="h-[100dvh] w-screen overflow-hidden">
              <iframe
                src={`${highResUrl}#toolbar=0&navpanes=0`}
                title={file.title}
                className="h-full w-full border-none"
              />
            </div>
          )}

          {!isImage && !isPdf && (
            <div className="flex min-h-[100dvh] w-full items-center justify-center p-4">
              <div className="flex max-w-md flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl">
                <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800 text-[#EFCE02]">
                  <FileText className="h-10 w-10" />
                </div>
                <h2 className="text-lg font-semibold text-white">{file.title}</h2>
                <p className="mt-1 text-sm text-zinc-400">{file.originalFilename}</p>
              </div>
            </div>
          )}
        </div>

        {/* Physical Zoom Controls (Docked sleekly at bottom center for easy thumb access) */}
        {isImage && (
          <div className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] left-1/2 -translate-x-1/2 z-40 flex items-center gap-1 rounded-full border border-zinc-800/80 bg-zinc-950/85 px-3 py-1.5 shadow-2xl backdrop-blur-md">
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
              title="Reset to 100% fit"
            >
              {Math.round(scale * 100)}%
            </button>

            <button
              type="button"
              onClick={handleZoomIn}
              disabled={scale >= 5}
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
                title="Reset zoom"
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

          {isImage && (
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
                disabled={scale >= 5}
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
      <main className="relative flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
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
            className="relative flex items-center justify-center transition-transform duration-100 ease-out select-none"
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          >
            {lowResUrl && (
              <img
                src={lowResUrl}
                alt={file.title}
                fetchPriority="high"
                decoding="async"
                className={`max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl transition-opacity duration-300 ${
                  isHighResLoaded ? "opacity-0 absolute pointer-events-none" : "opacity-100 blur-[0.5px]"
                }`}
              />
            )}

            <img
              src={highResUrl}
              alt={file.title}
              fetchPriority={lowResUrl ? "auto" : "high"}
              decoding="async"
              onLoad={() => setIsHighResLoaded(true)}
              className={`max-h-[82vh] max-w-[92vw] rounded-lg object-contain shadow-2xl transition-opacity duration-300 ${
                isHighResLoaded || !lowResUrl ? "opacity-100" : "opacity-0 absolute pointer-events-none"
              }`}
            />
          </div>
        )}

        {/* PDF Mode */}
        {isPdf && (
          <div className="relative h-[84vh] w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            {lowResUrl && !isHighResLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 p-4 transition-opacity duration-300">
                <img
                  src={lowResUrl}
                  alt={file.title}
                  fetchPriority="high"
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            )}

            <iframe
              src={`${highResUrl}#toolbar=1&navpanes=0`}
              title={file.title}
              onLoad={() => setIsHighResLoaded(true)}
              className="h-full w-full border-none"
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
