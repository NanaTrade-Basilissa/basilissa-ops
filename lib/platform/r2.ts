import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { scoped } from "@/lib/platform/logger";

const log = scoped("platform.storage");

function clean(val?: string): string {
  if (!val) return "";
  return val.trim().replace(/^["']|["']$/g, "");
}

/**
 * Universal S3-compatible Object Storage Client.
 * Supports:
 * 1. Neon Object Storage (AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME)
 * 2. Cloudflare R2 (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME)
 */

let s3ClientInstance: S3Client | null = null;

export function isStorageConfigured(): boolean {
  const hasNeon = Boolean(
    process.env.AWS_ENDPOINT_URL_S3 &&
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY
  );

  const hasR2 = Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME
  );

  return hasNeon || hasR2;
}

// Backward compatibility alias
export const isR2Configured = isStorageConfigured;

function parseBucketAndPrefix(rawBucket: string) {
  const parts = rawBucket.split("/").map((p) => p.trim()).filter(Boolean);
  const bucketName = parts[0] || "basilissaops";
  const prefix = parts.slice(1).join("/");
  return { bucketName, prefix };
}

export function getStorageClient(): { client: S3Client; bucketName: string; defaultPrefix: string; isNeon: boolean } | null {
  const neonEndpoint = clean(process.env.AWS_ENDPOINT_URL_S3);
  const neonAccessKey = clean(process.env.AWS_ACCESS_KEY_ID);
  const neonSecretKey = clean(process.env.AWS_SECRET_ACCESS_KEY);
  const neonRegion = clean(process.env.AWS_REGION) || "us-east-1";
  const rawNeonBucket = clean(process.env.AWS_BUCKET_NAME) || "basilissaops";

  if (neonEndpoint && neonAccessKey && neonSecretKey) {
    const { bucketName, prefix } = parseBucketAndPrefix(rawNeonBucket);
    if (!s3ClientInstance) {
      s3ClientInstance = new S3Client({
        region: neonRegion,
        endpoint: neonEndpoint,
        credentials: {
          accessKeyId: neonAccessKey,
          secretAccessKey: neonSecretKey,
        },
        forcePathStyle: true,
      });
    }
    return { client: s3ClientInstance, bucketName, defaultPrefix: prefix, isNeon: true };
  }

  // Fallback to Cloudflare R2
  const r2Account = clean(process.env.R2_ACCOUNT_ID);
  const r2AccessKey = clean(process.env.R2_ACCESS_KEY_ID);
  const r2SecretKey = clean(process.env.R2_SECRET_ACCESS_KEY);
  const r2Bucket = clean(process.env.R2_BUCKET_NAME);

  if (r2Account && r2AccessKey && r2SecretKey && r2Bucket) {
    const { bucketName, prefix } = parseBucketAndPrefix(r2Bucket);
    if (!s3ClientInstance) {
      s3ClientInstance = new S3Client({
        region: "auto",
        endpoint: `https://${r2Account}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2AccessKey,
          secretAccessKey: r2SecretKey,
        },
      });
    }
    return { client: s3ClientInstance, bucketName, defaultPrefix: prefix, isNeon: false };
  }

  return null;
}

export function getR2Client(): S3Client | null {
  const storage = getStorageClient();
  return storage ? storage.client : null;
}

export type PresignedUploadResult = {
  uploadUrl: string;
  publicUrl: string;
  fileKey: string;
  expiresInSeconds: number;
};

/**
 * Generates a presigned PUT URL allowing the client (browser or mobile app)
 * to upload directly to object storage without hitting server memory limits.
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
  const storage = getStorageClient();
  if (!storage) {
    log.warn("Cannot generate presigned upload URL: storage credentials missing.");
    return null;
  }

  const { client, bucketName, defaultPrefix, isNeon } = storage;
  const objectKey = defaultPrefix ? `${defaultPrefix}/${key}` : key;

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });

  const customDomain = clean(process.env.R2_PUBLIC_DOMAIN || process.env.STORAGE_PUBLIC_DOMAIN).replace(/\/+$/, "");

  let publicUrl: string;
  if (customDomain) {
    publicUrl = `${customDomain}/${objectKey}`;
  } else if (isNeon) {
    const endpoint = clean(process.env.AWS_ENDPOINT_URL_S3).replace(/\/+$/, "");
    publicUrl = `${endpoint}/${bucketName}/${objectKey}`;
  } else {
    publicUrl = `https://${bucketName}.${clean(process.env.R2_ACCOUNT_ID)}.r2.cloudflarestorage.com/${objectKey}`;
  }

  return {
    uploadUrl,
    publicUrl,
    fileKey: objectKey,
    expiresInSeconds,
  };
}

/**
 * Generates a presigned GET URL for temporary authorized downloading/streaming.
 */
export async function createPresignedDownloadUrl({
  key,
  expiresInSeconds = 3600 * 24, // 24 hours
}: {
  key: string;
  expiresInSeconds?: number;
}): Promise<string | null> {
  const storage = getStorageClient();
  if (!storage) return null;

  const { client, bucketName, defaultPrefix } = storage;
  // If the key does not already start with defaultPrefix, prepend it
  const objectKey = defaultPrefix && !key.startsWith(defaultPrefix) ? `${defaultPrefix}/${key}` : key;

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: objectKey,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Resolves a storage URL into a secure, time-limited presigned URL if it is stored in private object storage.
 * If the file is an external public asset (e.g. sample video or Unsplash photo), it returns the original URL.
 */
export async function resolveStorageUrl(fileUrl: string, fileKey?: string | null): Promise<string> {
  if (!fileKey) return fileUrl;

  // External sample URLs that do not belong to our bucket
  if (
    fileUrl.startsWith("https://commondatastorage") ||
    fileUrl.startsWith("https://images.unsplash") ||
    fileUrl.startsWith("https://www.w3.org")
  ) {
    return fileUrl;
  }

  try {
    const presigned = await createPresignedDownloadUrl({ key: fileKey, expiresInSeconds: 86400 });
    return presigned || fileUrl;
  } catch (error) {
    log.error("Failed to generate presigned download URL", { fileKey, error });
    return fileUrl;
  }
}

/**
 * Deletes a file from object storage.
 */
export async function deleteFromR2(fileKey: string): Promise<boolean> {
  const storage = getStorageClient();
  if (!storage) return false;

  const { client, bucketName } = storage;

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: fileKey,
      })
    );
    return true;
  } catch (error) {
    log.error("Failed to delete file from storage", { fileKey, error });
    return false;
  }
}

export const deleteFromStorage = deleteFromR2;
