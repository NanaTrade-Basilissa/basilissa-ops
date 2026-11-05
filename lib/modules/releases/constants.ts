/** Releases module: public constants and pure helpers. Client-safe. */
export * from "./version";

export type AppReleaseItem = {
  id: string;
  platform: "IOS" | "ANDROID";
  version: string;
  updateMode: "FLEXIBLE" | "REQUIRED";
  releaseNotes: string | null;
  releasedAt: string;
  createdByName: string;
};
