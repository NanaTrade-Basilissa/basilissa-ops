"use client";
/* eslint-disable @next/next/no-img-element */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  WifiOff,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useOfflineCache } from "@/components/files/use-offline-cache";

interface PresentationViewerProps {
  slides: string[];
  title: string;
  orientation?: "LANDSCAPE" | "PORTRAIT" | null;
  autoSlideIntervalSeconds?: number;
  initialSlideIndex?: number;
}

export function PresentationViewer({
  slides,
  title,
  orientation = "LANDSCAPE",
  autoSlideIntervalSeconds = 8,
  initialSlideIndex = 0,
}: PresentationViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialSlideIndex);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [progress, setProgress] = useState(0); // 0 to 100%

  const containerRef = useRef<HTMLDivElement>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const durationMs = autoSlideIntervalSeconds * 1000;

  // Offline caching for TV / offline playback
  const { isOnline, isCached } = useOfflineCache({ urlsToCache: slides });

  const totalSlides = Math.max(1, slides.length);
  const isLandscape = orientation !== "PORTRAIT";

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % totalSlides);
    setProgress(0);
    startTimeRef.current = null;
  }, [totalSlides]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + totalSlides) % totalSlides);
    setProgress(0);
    startTimeRef.current = null;
  }, [totalSlides]);

  const togglePlay = useCallback(() => {
    setIsPlaying((p) => !p);
    startTimeRef.current = null;
  }, []);

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
    } else {
      await document.exitFullscreen().catch(() => {});
    }
  }, []);

  // Fullscreen change listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Auto-hide controls dock for clean TV display
  const resetIdleTimer = useCallback(() => {
    setShowControls(true);
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3500);
  }, [isPlaying]);

  useEffect(() => {
    idleTimerRef.current = setTimeout(() => {
      if (isPlaying) {
        setShowControls(false);
      }
    }, 3500);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [isPlaying]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetIdleTimer();
      if (e.key === "ArrowRight" || e.key === "PageDown") {
        handleNext();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        handlePrev();
      } else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "f") {
        toggleFullscreen();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev, togglePlay, toggleFullscreen, resetIdleTimer]);

  // 8-second smooth animation loop
  useEffect(() => {
    if (!isPlaying || isHovered || totalSlides <= 1) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const step = (timestamp: number) => {
      if (!startTimeRef.current) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const currentProgress = Math.min(100, (elapsed / durationMs) * 100);
      setProgress(currentProgress);

      if (elapsed >= durationMs) {
        handleNext();
      } else {
        animFrameRef.current = requestAnimationFrame(step);
      }
    };

    animFrameRef.current = requestAnimationFrame(step);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, isHovered, currentIndex, durationMs, handleNext, totalSlides]);

  return (
    <div
      ref={containerRef}
      onMouseMove={resetIdleTimer}
      onTouchStart={resetIdleTimer}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative flex min-h-screen w-full flex-col items-center justify-center bg-black text-white select-none overflow-hidden"
    >
      {/* Offline Status Badge */}
      <div
        className={`fixed top-4 left-4 z-40 flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-md transition-opacity duration-300 ${
          !isOnline
            ? "border border-amber-500/40 bg-amber-500/20 text-amber-300 opacity-100"
            : isCached && showControls
            ? "border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 opacity-60 hover:opacity-100"
            : "opacity-0 pointer-events-none"
        }`}
      >
        {!isOnline ? (
          <>
            <WifiOff className="h-3.5 w-3.5 animate-pulse" />
            <span>Offline · TV Loop Active</span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>Cached for offline TV display</span>
          </>
        )}
      </div>

      {/* Main Slide Stage (Adaptive Landscape vs Portrait) */}
      <div
        className={`relative flex items-center justify-center w-full transition-all duration-300 ${
          isLandscape
            ? "max-w-6xl max-h-[92vh] aspect-[16/9] px-2 sm:px-6"
            : "max-w-md max-h-[94vh] aspect-[9/16] px-2 sm:px-4"
        }`}
      >
        {slides.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center p-8 bg-zinc-900/60 rounded-2xl border border-zinc-800">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-[#EFCE02] mb-3">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <h3 className="text-sm font-semibold text-white">Preparing Slideshow...</h3>
            <p className="mt-1 text-xs text-zinc-400 max-w-xs">
              Slide frames are currently being prepared for high-speed playback.
            </p>
          </div>
        )}

        {slides.map((slideUrl, idx) => {
          const isActive = idx === currentIndex;
          return (
            <div
              key={idx}
              className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ease-in-out ${
                isActive ? "opacity-100 z-10 pointer-events-auto" : "opacity-0 z-0 pointer-events-none"
              }`}
            >
              <img
                src={slideUrl}
                alt={`${title} - Slide ${idx + 1} of ${totalSlides}`}
                className={`w-full h-full object-contain rounded-xl shadow-2xl ${
                  isLandscape ? "max-h-[90vh]" : "max-h-[94vh]"
                }`}
                draggable={false}
                decoding="async"
                fetchPriority={isActive ? "high" : "auto"}
              />
            </div>
          );
        })}

        {/* 8-Second Progress Bar (Ticking indicator along slide bottom in Basilissa yellow) */}
        {isPlaying && totalSlides > 1 && (
          <div className="absolute bottom-1 left-4 right-4 z-20 h-1 overflow-hidden rounded-full bg-white/10 backdrop-blur-sm sm:left-8 sm:right-8">
            <div
              className="h-full bg-[#EFCE02] transition-[width] duration-75 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Navigation Touch / Click Zones */}
      {totalSlides > 1 && (
        <>
          <button
            onClick={handlePrev}
            aria-label="Previous Slide"
            className={`absolute left-4 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900/80 border border-zinc-700/60 text-white backdrop-blur-md transition-all hover:bg-zinc-800 hover:scale-105 active:scale-95 ${
              showControls ? "opacity-90 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={handleNext}
            aria-label="Next Slide"
            className={`absolute right-4 top-1/2 -translate-y-1/2 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-900/80 border border-zinc-700/60 text-white backdrop-blur-md transition-all hover:bg-zinc-800 hover:scale-105 active:scale-95 ${
              showControls ? "opacity-90 pointer-events-auto" : "opacity-0 pointer-events-none"
            }`}
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* Floating Bottom Control Bar (TV Auto-Hide) */}
      <div
        className={`fixed bottom-6 z-40 flex items-center gap-3 rounded-2xl border border-zinc-800/80 bg-zinc-900/90 px-4 py-2.5 shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          showControls ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0 pointer-events-none"
        }`}
      >
        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-[#EFCE02] transition-colors"
          title={isPlaying ? "Pause auto-slide" : "Start auto-slide (8s)"}
          aria-label={isPlaying ? "Pause auto-slide" : "Start auto-slide"}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current ml-0.5" />}
        </button>

        {/* Slide Counter */}
        <span className="px-2 text-xs font-semibold tracking-wider text-zinc-300">
          Slide {currentIndex + 1} <span className="text-zinc-500">/</span> {totalSlides}
        </span>

        {/* Orientation Indicator */}
        <span className="hidden sm:inline-block rounded-md bg-zinc-800/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          {isLandscape ? "16:9 Landscape" : "9:16 Portrait"}
        </span>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
          title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen (TV Mode)"}
          aria-label="Toggle Fullscreen"
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {/* Dot Indicators */}
      {totalSlides > 1 && totalSlides <= 20 && (
        <div
          className={`fixed bottom-20 z-30 flex items-center gap-1.5 transition-opacity duration-300 ${
            showControls ? "opacity-80" : "opacity-0 pointer-events-none"
          }`}
        >
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCurrentIndex(idx);
                setProgress(0);
                startTimeRef.current = null;
              }}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? "w-6 bg-[#EFCE02]" : "w-1.5 bg-zinc-600 hover:bg-zinc-400"
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
