import { redirect } from "next/navigation";

// The public entry point is the QR-driven /feedback flow; the root path
// simply forwards there. Admins go straight to /admin (which itself
// redirects unauthenticated visitors to /admin/login).
export default function Home() {
  redirect("/feedback");
}
