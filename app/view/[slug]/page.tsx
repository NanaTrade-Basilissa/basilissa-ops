import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";
import { resolvePublicFileBySlug } from "@/lib/modules/files/server";
import { ProgressiveViewer } from "@/components/files/progressive-viewer";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: "#09090b",
};

interface ViewPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ view?: string }>;
}

export async function generateMetadata({ params }: ViewPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await resolvePublicFileBySlug(slug);

  if (!data) {
    return {
      title: "File Not Available",
      description: "The requested file is either private or unavailable.",
    };
  }

  const { file } = data;
  return {
    title: `${file.title} | Basilissa Portal`,
    description: `View ${file.originalFilename} on Basilissa Portal.`,
    openGraph: {
      title: file.title,
      description: `View ${file.originalFilename} on Basilissa Portal.`,
      images: data.lowResResolvedUrl ? [{ url: data.lowResResolvedUrl }] : undefined,
    },
  };
}

export default async function PublicFileViewPage({ params, searchParams }: ViewPageProps) {
  const { slug } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const data = await resolvePublicFileBySlug(slug);

  if (!data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-center text-zinc-100">
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-900 text-zinc-400 shadow-xl">
          <Lock className="h-10 w-10 text-[#EFCE02]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          File Not Available
        </h1>
        <p className="mt-3 max-w-md text-sm text-zinc-400">
          This file is private, has been removed, or the link has changed. If you believe this is an error, please request an updated link from the sender.
        </p>
        <Link
          href="/"
          className="mt-8 flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-2.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Basilissa Home
        </Link>
      </div>
    );
  }

  const { file, highResResolvedUrl, lowResResolvedUrl, lowResPages } = data;

  // Direct Raw Mode: stream / redirect directly to the raw file asset
  if (file.displayMode === "DIRECT_RAW") {
    redirect(highResResolvedUrl);
  }

  // Determine initial mode: if file is set to RENDER_AS_PAGE or query ?view=page, open clean full-page
  const isPageMode =
    file.displayMode === "RENDER_AS_PAGE" || resolvedSearchParams.view === "page";

  return (
    <ProgressiveViewer
      file={file}
      highResUrl={highResResolvedUrl}
      lowResUrl={lowResResolvedUrl}
      lowResPages={lowResPages}
      initialMode={isPageMode ? "page" : "branded"}
    />
  );
}
