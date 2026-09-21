import { redirect } from "next/navigation";
import { requireAdminShell } from "@/lib/modules/identity/server";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdminShell();
  const sp = await searchParams;
  const params = new URLSearchParams();

  for (const [key, val] of Object.entries(sp)) {
    if (typeof val === "string") {
      params.set(key, val);
    } else if (Array.isArray(val)) {
      for (const item of val) {
        params.append(key, item);
      }
    }
  }

  // If user bookmarked audit tab, redirect to dedicated audit-trail page
  if (params.get("tab") === "audit") {
    params.delete("tab");
    const qs = params.toString();
    redirect(qs ? `/admin/audit-trail?${qs}` : "/admin/audit-trail");
  }

  // 2FA has moved to /admin/settings
  const qs = params.toString();
  redirect(qs ? `/admin/settings?${qs}` : "/admin/settings");
}
