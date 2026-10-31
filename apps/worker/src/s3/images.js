import { createHash } from "crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { S3Client as BunS3Client } from "bun";
import { getR2Config, publicObjectUrl } from "./config.js";
import { Upload } from "@aws-sdk/lib-storage";

const DEFAULT_IMAGE_PREFIX = "listings";

export function buildPublicUrl(
  key,
  {
    bucket = process.env.S3_BUCKET,
    region = process.env.S3_REGION,
    provider = process.env.OBJECT_STORAGE_PROVIDER || "s3",
    publicBaseUrl = process.env.R2_PUBLIC_BASE_URL,
  } = {},
) {
  if (provider === "r2")
    return publicObjectUrl({ provider, publicBaseUrl }, key);
  if (provider !== "s3")
    throw new Error("OBJECT_STORAGE_PROVIDER must be s3 or r2");
  if (!bucket) throw new Error("S3_BUCKET is missing");
  if (!region) return `https://${bucket}.s3.amazonaws.com/${key}`;
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

function cleanSegment(value, fallback) {
  const cleaned = String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function basenameFromUrl(imageUrl) {
  try {
    const pathname = new URL(imageUrl).pathname;
    const raw = pathname.split("/").filter(Boolean).pop();
    return cleanSegment(decodeURIComponent(raw ?? ""), "image");
  } catch {
    return "image";
  }
}

export function buildImageKey(
  { source, sourceListingId, index, url },
  { prefix = process.env.S3_IMAGE_PREFIX || DEFAULT_IMAGE_PREFIX } = {},
) {
  const hash = createHash("sha256")
    .update(String(url))
    .digest("hex")
    .slice(0, 12);
  const ordinal = String(index).padStart(2, "0");
  return [
    cleanSegment(prefix, DEFAULT_IMAGE_PREFIX),
    cleanSegment(source, "unknown-source"),
    cleanSegment(sourceListingId, "unknown-listing"),
    `${ordinal}-${hash}-${basenameFromUrl(url)}`,
  ].join("/");
}

export function createS3Client({
  region = process.env.S3_REGION,
  accessKeyId = process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY,
  provider = process.env.OBJECT_STORAGE_PROVIDER || "s3",
  env = process.env,
} = {}) {
  if (provider === "r2") {
    const config = getR2Config({
      ...env,
      OBJECT_STORAGE_PROVIDER: provider,
    });
    const client = new BunS3Client({
      bucket: config.bucket,
      endpoint: config.clientOptions.endpoint,
      region: "auto",
      ...config.clientOptions.credentials,
      sessionToken: "",
      virtualHostedStyle: false,
    });
    // Bun 1.4.3 inherits startup session-token defaults even when given "".
    // Detect that locally rather than sending AWS credentials to R2.
    const probe = new URL(
      client.presign("__r2_configuration_check", { expiresIn: 1 }),
    );
    if (probe.searchParams.has("X-Amz-Security-Token")) {
      throw new Error(
        "Remove S3_SESSION_TOKEN and AWS_SESSION_TOKEN and restart before using native R2 storage",
      );
    }
    return client;
  }
  if (provider !== "s3")
    throw new Error("OBJECT_STORAGE_PROVIDER must be s3 or r2");
  // Keep the SDK's AWS credential chain during the rollback window.
  return new S3Client({
    region,
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
    followRegionRedirects: true,
  });
}

async function downloadImage(url, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Image download failed (${response.status} ${response.statusText}) for ${url}`,
    );
  }

  const contentType =
    response.headers?.get?.("content-type")?.split(";")[0] || undefined;
  const body = Buffer.from(await response.arrayBuffer());
  return { body, contentType };
}

export async function uploadListingPhoto(
  imageUrl,
  listing,
  index,
  options = {},
) {
  const env = options.env || process.env;
  const provider = (options.provider || env.OBJECT_STORAGE_PROVIDER || "s3")
    .trim()
    .toLowerCase();
  const bucket =
    options.bucket ?? (provider === "r2" ? env.R2_BUCKET : env.S3_BUCKET);
  const region = options.region ?? env.S3_REGION;
  const prefix = options.prefix ?? env.S3_IMAGE_PREFIX ?? DEFAULT_IMAGE_PREFIX;
  const publicBaseUrl = options.publicBaseUrl ?? env.R2_PUBLIC_BASE_URL;
  if (!bucket)
    throw new Error(
      provider === "r2" ? "R2_BUCKET is missing" : "S3_BUCKET is missing",
    );
  const key = buildImageKey({ ...listing, index, url: imageUrl }, { prefix });
  // A private S3 API URL cannot be used as a public listing-photo URL.
  // Validate delivery before downloading or writing an object.
  const publicUrl = buildPublicUrl(key, {
    bucket,
    region,
    provider,
    publicBaseUrl,
  });
  const client =
    options.client ||
    createS3Client({ region, provider, env: { ...env, R2_BUCKET: bucket } });
  const { body, contentType } = await downloadImage(imageUrl, {
    fetchImpl: options.fetchImpl,
  });
  if (provider === "r2") {
    await client.write(key, body, {
      ...(contentType ? { type: contentType } : {}),
    });
  } else {
    const Uploader = options.Uploader || Upload;
    const uploader = new Uploader({
      client,
      params: {
        Bucket: bucket,
        ACL: "public-read",
        Key: key,
        Body: body,
        ...(contentType ? { ContentType: contentType } : {}),
      },
    });
    await uploader.done();
  }
  return publicUrl;
}

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function mirrorListingPhotos(
  canonical,
  { uploadPhoto = uploadListingPhoto } = {},
) {
  const originalPhotos = Array.isArray(canonical.photos)
    ? canonical.photos.filter(Boolean)
    : [];
  if (originalPhotos.length === 0) return canonical;

  const uploadedPhotos = [];
  const photoUploadErrors = [];

  for (const [index, photoUrl] of originalPhotos.entries()) {
    try {
      uploadedPhotos.push(await uploadPhoto(photoUrl, canonical, index));
    } catch (error) {
      photoUploadErrors.push({ url: photoUrl, error: normalizeError(error) });
    }
  }

  if (photoUploadErrors.length === 0) {
    return { ...canonical, photos: uploadedPhotos };
  }

  const raw = {
    ...(canonical.raw && typeof canonical.raw === "object"
      ? canonical.raw
      : {}),
    photoUploadErrors,
  };

  return {
    ...canonical,
    photos: uploadedPhotos.length > 0 ? uploadedPhotos : originalPhotos,
    raw,
  };
}
