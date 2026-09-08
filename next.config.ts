import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Produces .next/standalone — a self-contained server bundle with only
  // the production node_modules it actually needs, traced automatically.
  // The Dockerfile copies just that output into the final image, which is
  // what keeps it small. Skipped on Vercel, which builds with its own
  // adapter and doesn't use this output shape.
  output: process.env.VERCEL ? undefined : "standalone",
};

export default nextConfig;
