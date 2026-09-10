import { redirect } from "next/navigation";
import { requirePermission } from "@/lib/modules/identity/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function QuestionsRedirectPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePermission("question:read");

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      params.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    }
  }
  const qs = params.toString();
  redirect(qs ? `/admin/feedback/questions?${qs}` : "/admin/feedback/questions");
}
