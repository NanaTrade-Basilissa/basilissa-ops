import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Basilissa Ops",
    template: "%s | Basilissa Ops",
  },
  description:
    "Operations management portal for Basilissa Ghana. Manage staff attendance, shift scheduling, candidate assessments, aptitude tests, branch analytics, and customer feedback.",
  openGraph: {
    title: "Basilissa Ops",
    description:
      "Operations management portal for Basilissa Ghana. Manage staff attendance, shift scheduling, candidate assessments, aptitude tests, branch analytics, and customer feedback.",
    siteName: "Basilissa Ops",
    type: "website",
    images: [
      {
        url: "/bsa-logo-icon.png",
        width: 512,
        height: 512,
        alt: "Basilissa Ops",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Basilissa Ops",
    description:
      "Operations management portal for Basilissa Ghana. Manage staff attendance, shift scheduling, candidate assessments, aptitude tests, branch analytics, and customer feedback.",
    images: ["/bsa-logo-icon.png"],
  },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
