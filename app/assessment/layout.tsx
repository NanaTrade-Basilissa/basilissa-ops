import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Assessment | Basilissa",
    template: "%s | Basilissa",
  },
  description: "Candidate assessment portal for Basilissa Ghana.",
  openGraph: {
    title: "Assessment | Basilissa",
    description: "Candidate assessment portal for Basilissa Ghana.",
    siteName: "Basilissa",
    type: "website",
    images: [{ url: "/bsa-logo-icon.png", width: 512, height: 512, alt: "Basilissa" }],
  },
  twitter: {
    card: "summary",
    title: "Assessment | Basilissa",
    description: "Candidate assessment portal for Basilissa Ghana.",
    images: ["/bsa-logo-icon.png"],
  },
};

export default function AssessmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
