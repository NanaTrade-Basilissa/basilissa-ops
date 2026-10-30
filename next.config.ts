import type { NextConfig } from "next";
import os from "node:os";

const localIps = Object.values(os.networkInterfaces())
  .flat()
  .filter((iface): iface is os.NetworkInterfaceInfo => Boolean(iface && iface.family === "IPv4" && !iface.internal))
  .map((iface) => iface.address);

const devOrigins = [
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
  ...localIps.flatMap((ip) => [`${ip}:3000`, `${ip}:3001`]),
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["@napi-rs/canvas", "unpdf", "sharp"],
  // Produces .next/standalone — a self-contained server bundle with only
  // the production node_modules it actually needs, traced automatically.
  // The Dockerfile copies just that output into the final image, which is
  // what keeps it small. Skipped on Vercel, which builds with its own
  // adapter and doesn't use this output shape.
  output: process.env.VERCEL ? undefined : "standalone",
  allowedDevOrigins: [
    "localhost:3000",
    "localhost:3001",
    "127.0.0.1:3000",
    "127.0.0.1:3001",
    ...localIps.flatMap((ip) => [`${ip}:3000`, `${ip}:3001`, ip]),
  ],
  experimental: {
    serverActions: {
      allowedOrigins: devOrigins,
    },
  },
};

export default nextConfig;
