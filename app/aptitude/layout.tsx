import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Aptitude Test | Basilissa",
    template: "%s | Basilissa",
  },
  description: "Candidate aptitude testing portal for Basilissa Ghana.",
  openGraph: {
    title: "Aptitude Test | Basilissa",
    description: "Candidate aptitude testing portal for Basilissa Ghana.",
    siteName: "Basilissa",
    type: "website",
    images: [{ url: "/bsa-logo-icon.png", width: 512, height: 512, alt: "Basilissa" }],
  },
  twitter: {
    card: "summary",
    title: "Aptitude Test | Basilissa",
    description: "Candidate aptitude testing portal for Basilissa Ghana.",
    images: ["/bsa-logo-icon.png"],
  },
};

export default function AptitudeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
