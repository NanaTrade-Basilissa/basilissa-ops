import type { Metadata } from "next";
import { getPublicFeedbackForm } from "@/lib/modules/feedback/server";
import { FeedbackFlow } from "@/components/feedback/feedback-flow";

export const metadata: Metadata = {
  title: "Share your feedback",
};

// Always render fresh: branch active/inactive status can change at any
// time from the admin dashboard and must be respected immediately.
export const dynamic = "force-dynamic";

type FeedbackPageProps = {
  searchParams: Promise<{ branch?: string | string[] }>;
};

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  const { branch: branchParam } = await searchParams;
  const requestedSlug = typeof branchParam === "string" ? branchParam : undefined;

  const { branches, questions, preselectedBranch, requestedBranchInactive } =
    await getPublicFeedbackForm(requestedSlug);

  return (
    <FeedbackFlow
      branches={branches}
      questions={questions}
      preselectedBranch={preselectedBranch}
      requestedBranchInactive={requestedBranchInactive}
    />
  );
}
