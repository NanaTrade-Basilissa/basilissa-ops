"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef } from "react";
import {
  Download,
  Eye,
  FileText,
  Maximize2,
  Minimize2,
  RotateCw,
  Share2,
  ZoomIn,
  ZoomOut,
  Check,
} from "lucide-react";
import type { HostedFileItem } from "@/lib/modules/files/constants";

interface ProgressiveViewerProps {
  file: HostedFileItem;
  highResUrl: string;
  lowResUrl: string | null;
}

export function ProgressiveViewer({
  file,
  highResUrl,
  lowResUrl,
}: ProgressiveViewerProps) {
  const isImage = file.mimeType.startsWith("image/");
  const isPdf = file.mimeType === "application/pdf";

  const [isHighResLoaded, setIsHighResLoaded] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
        // Fallback to true so user sees image if browser cache or CORS quirk
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

  const handleZoomIn = () => setZoomLevel((z) => Math.min(3, +(z + 0.25).toFixed(2)));
  const handleZoomOut = () => setZoomLevel((z) => Math.max(0.5, +(z - 0.25).toFixed(2)));
  const handleResetZoom = () => {
    setZoomLevel(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

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

  return (
    <div
      ref={containerRef}
      className="flex min-h-screen flex-col bg-zinc-950 font-sans text-zinc-100 antialiased selection:bg-amber-500 selection:text-black"
    >
      {/* Top Header / Brand Bar */}
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-zinc-800/80 bg-zinc-950/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 font-bold text-zinc-950 shadow-sm shadow-amber-500/20">
            B
          </div>
          <div className="flex flex-col">
            <span className="line-clamp-1 max-w-[200px] text-sm font-semibold tracking-tight text-white sm:max-w-md md:max-w-xl">
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
          {isImage && (
            <div className="hidden items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900/90 p-1 sm:flex">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.5}
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
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 3}
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
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-all hover:bg-amber-400 active:scale-95"
            title="Download original file"
          >
            <Download className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </a>
        </div>
      </header>

      {/* Main Viewing Canvas */}
      <main className="relative flex flex-1 items-center justify-center overflow-auto p-4 sm:p-8">
        {/* Subtle background grid pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Image Mode Progressive Viewer */}
        {isImage && (
          <div
            className="relative flex items-center justify-center transition-transform duration-200 ease-out"
            style={{
              transform: `scale(${zoomLevel}) rotate(${rotation}deg)`,
              transformOrigin: "center center",
            }}
          >
            {/* Low-Res Preview (Loads instantly, fetchpriority="high", smoothly cross-fades) */}
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

            {/* High-Res Asset (Rendered smoothly in place without layout shifts) */}
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

        {/* PDF Mode Progressive Viewer */}
        {isPdf && (
          <div className="relative h-[84vh] w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl">
            {/* Low-res SVG badge representation while high-res PDF streams */}
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

            {/* Embedded Native PDF Viewer with in-app controls */}
            <iframe
              src={`${highResUrl}#toolbar=1&navpanes=0`}
              title={file.title}
              onLoad={() => setIsHighResLoaded(true)}
              className="h-full w-full border-none"
            />
          </div>
        )}

        {/* Generic Document / Other Files */}
        {!isImage && !isPdf && (
          <div className="flex max-w-md flex-col items-center rounded-2xl border border-zinc-800 bg-zinc-900/90 p-8 text-center shadow-2xl">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-zinc-800 text-amber-400">
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
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-zinc-950 transition-all hover:bg-amber-400 active:scale-95"
            >
              <Download className="h-4 w-4" />
              Download Document
            </a>
          </div>
        )}
      </main>

      {/* Bottom Status / Progressive Indicator */}
      <footer className="flex h-9 items-center justify-between border-t border-zinc-800/60 bg-zinc-950 px-4 text-[11px] text-zinc-500 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          <span>
            {isHighResLoaded
              ? "High-Resolution Rendered"
              : lowResUrl
                ? "Fast Preview Loaded &middot; Optimizing high-res in background..."
                : "Rendering Asset..."}
          </span>
        </div>
        <div className="text-zinc-600">Basilissa File Portal</div>
      </footer>
    </div>
  );
}
