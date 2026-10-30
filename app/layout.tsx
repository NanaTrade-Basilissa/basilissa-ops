import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteAnalytics } from "@/components/site-analytics";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/platform/constants";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://ops.basilissagh.com";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#FFE300",
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${APP_NAME} Feedback`,
    template: `%s | ${APP_NAME} Feedback`,
  },
  description:
    "Share feedback about your visit to a Basilissa Ghana branch, and the admin dashboard that reports on it.",
  openGraph: {
    title: `${APP_NAME} Feedback`,
    description:
      "Share feedback about your visit to a Basilissa Ghana branch, and the admin dashboard that reports on it.",
    siteName: `${APP_NAME} Feedback`,
    images: [{ url: "/bsa-logo-icon.png", width: 512, height: 512, alt: `${APP_NAME} Logo` }],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: `${APP_NAME} Feedback`,
    description:
      "Share feedback about your visit to a Basilissa Ghana branch, and the admin dashboard that reports on it.",
    images: ["/bsa-logo-icon.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster richColors closeButton position="top-center" />
        <SiteAnalytics />
      </body>
    </html>
  );
}
