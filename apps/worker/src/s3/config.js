// Explicit opt-in keeps existing S3 deployments unchanged until a verified cutover.
function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required for R2 storage`);
  return value;
}

function getR2Config(env = process.env) {
  const endpoint = new URL(
    env.R2_ENDPOINT ||
      `https://${required(env, "R2_ACCOUNT_ID")}.eu.r2.cloudflarestorage.com`,
  );
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash ||
    !/^[a-f0-9]{32}\.eu\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname)
  ) {
    throw new Error(
      "R2_ENDPOINT must be an HTTPS account-level EU Cloudflare R2 endpoint",
    );
  }
  return {
    provider: "r2",
    bucket: required(env, "R2_BUCKET"),
    region: "auto",
    publicBaseUrl: env.R2_PUBLIC_BASE_URL || null,
    clientOptions: {
      endpoint: endpoint.origin,
      region: "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId: required(env, "R2_ACCESS_KEY_ID"),
        secretAccessKey: required(env, "R2_SECRET_ACCESS_KEY"),
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    },
  };
}

function publicObjectUrl(config, key) {
  if (!config.publicBaseUrl)
    throw new Error("R2_PUBLIC_BASE_URL is required for public media");
  const base = new URL(config.publicBaseUrl);
  if (
    base.protocol !== "https:" ||
    base.username ||
    base.password ||
    base.search ||
    base.hash ||
    base.hostname.endsWith(".r2.cloudflarestorage.com")
  ) {
    throw new Error(
      "R2_PUBLIC_BASE_URL must be an HTTPS public domain, not the private R2 API",
    );
  }
  if (
    typeof key !== "string" ||
    !key ||
    key
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(
      "Object key must contain nonempty, non-traversing segments",
    );
  }
  return `${base.href.replace(/\/+$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

export { getR2Config, publicObjectUrl };
