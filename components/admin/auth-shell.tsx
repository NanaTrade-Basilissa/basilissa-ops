import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

/**
 * The `login-02` split-screen shell, shared by every unauthenticated admin
 * page (sign in, MFA challenge, forgot/reset password) so the whole auth
 * flow reads as one thing rather than one migrated screen next to three
 * old ones. The block's stock photo is replaced with the brand mark on a
 * plain panel — this app has no marketing imagery to put there.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center md:justify-start">
          <Logo size="sm" />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{children}</div>
        </div>
      </div>
      <div className="relative hidden bg-sidebar lg:flex lg:items-center lg:justify-center">
        <Logo size="lg" />
      </div>
    </div>
  );
}
