import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { scoped } from "@/lib/platform/logger";

const log = scoped("platform.r2");

/**
 * Cloudflare R2 Client (S3-compatible API).
 *
 * Requirements in environment:
 * - R2_ACCOUNT_ID: Cloudflare Account ID
 * - R2_ACCESS_KEY_ID: S3-compatible Access Key ID
 * - R2_SECRET_ACCESS_KEY: S3-compatible Secret Access Key
 * - R2_BUCKET_NAME: Target bucket name (e.g. basilissa-training-hub)
 * - R2_PUBLIC_DOMAIN: Public custom domain or r2.dev URL (e.g. https://pub-xxx.r2.dev or https://media.basilissagh.com)
 */

let r2ClientInstance: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );
}

export function getR2Client(): S3Client | null {
  if (r2ClientInstance) return r2ClientInstance;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!accountId || !accessKeyId || !secretAccessKey) {
    log.warn("Cloudflare R2 is not fully configured; missing credentials.");
    return null;
  }

  r2ClientInstance = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });

  return r2ClientInstance;
}

export type PresignedUploadResult = {
  uploadUrl: string;
  publicUrl: string;
  fileKey: string;
  expiresInSeconds: number;
};

/**
 * Generates a presigned PUT URL allowing the client (browser or mobile app)
 * to upload a video, picture, or PDF directly to Cloudflare R2 without passing
 * through serverless function memory or hitting payload limits.
 */
export async function createPresignedUploadUrl({
  key,
  contentType,
  expiresInSeconds = 3600,
}: {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<PresignedUploadResult | null> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicDomain = process.env.R2_PUBLIC_DOMAIN?.replace(/\/+$/, "");

  if (!client || !bucketName) {
    log.warn("Cannot generate presigned URL: R2 client or bucket name missing.");
    return null;
  }

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

  // If public domain is configured (e.g. https://media.basilissagh.com or https://pub-xxx.r2.dev), use it.
  // Otherwise, default to standard R2 URL structure.
  const publicUrl = publicDomain
    ? `${publicDomain}/${key}`
    : `https://${bucketName}.${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

  return {
    uploadUrl,
    publicUrl,
    fileKey: key,
    expiresInSeconds,
  };
}

/**
 * Deletes a file from Cloudflare R2.
 */
export async function deleteFromR2(fileKey: string): Promise<boolean> {
  const client = getR2Client();
  const bucketName = process.env.R2_BUCKET_NAME;

  if (!client || !bucketName) return false;

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
      })
    );
    return true;
  } catch (error) {
    log.error("Failed to delete file from R2", { fileKey, error });
    return false;
  }
}
