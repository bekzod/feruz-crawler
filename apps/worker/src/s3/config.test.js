import { expect, test } from "bun:test";
import { getR2Config } from "./config.js";
import { createS3Client } from "./images.js";

const env = {
  OBJECT_STORAGE_PROVIDER: "r2",
  R2_ACCOUNT_ID: "a".repeat(32),
  R2_BUCKET: "photos",
  R2_ACCESS_KEY_ID: "test-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
};

test("R2 requires explicit isolated credentials and an account endpoint", () => {
  expect(getR2Config(env).clientOptions.region).toBe("auto");
  for (const key of [
    "R2_ACCOUNT_ID",
    "R2_BUCKET",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
  ])
    expect(() => getR2Config({ ...env, [key]: "" })).toThrow();
  for (const R2_ENDPOINT of [
    "https://evil.example",
    "http://localhost",
    `https://${"a".repeat(32)}.eu.r2.cloudflarestorage.com/photos`,
  ])
    expect(() => getR2Config({ ...env, R2_ENDPOINT })).toThrow();
});

test("native Bun presigning uses path-style R2, auto region and no ACL/session token", () => {
  const client = createS3Client({ provider: "r2", env });
  const url = new URL(
    client.presign("photos/a b.jpg", { method: "PUT", expiresIn: 60 }),
  );
  expect(url.hostname).toBe(`${"a".repeat(32)}.eu.r2.cloudflarestorage.com`);
  expect(url.pathname).toBe("/photos/photos/a%20b.jpg");
  expect(url.searchParams.get("X-Amz-Credential")).toContain(
    "/auto/s3/aws4_request",
  );
  expect(url.searchParams.get("X-Amz-Credential")).toStartWith("test-key/");
  expect(url.searchParams.has("X-Amz-Security-Token")).toBe(false);
  expect(url.searchParams.has("x-amz-acl")).toBe(false);
});

const startupTokens = [
  ["S3 only", { S3_SESSION_TOKEN: "test-s3-session" }],
  ["AWS only", { AWS_SESSION_TOKEN: "test-aws-session" }],
  [
    "both",
    {
      S3_SESSION_TOKEN: "test-s3-session",
      AWS_SESSION_TOKEN: "test-aws-session",
    },
  ],
];

for (const [label, tokens] of startupTokens) {
  for (const clearAfterStartup of [false, true]) {
    test(`native R2 blocks ${label} startup tokens before I/O (clear process.env: ${clearAfterStartup})`, () => {
      const childEnv = { ...process.env };
      delete childEnv.S3_SESSION_TOKEN;
      delete childEnv.AWS_SESSION_TOKEN;
      const child = Bun.spawnSync(
        [
          process.execPath,
          "--eval",
          `
        import { uploadListingPhoto } from ${JSON.stringify(new URL("./images.js", import.meta.url).pathname)};
        if (${clearAfterStartup}) { delete process.env.S3_SESSION_TOKEN; delete process.env.AWS_SESSION_TOKEN; }
        Bun.S3Client.prototype.write = async () => { throw new Error('unexpected storage write'); };
        globalThis.fetch = async () => { throw new Error('unexpected image fetch'); };
        try {
          await uploadListingPhoto('https://source.example/photo.jpg', {}, 0, {
            env: ${JSON.stringify({ ...env, R2_PUBLIC_BASE_URL: "https://media.example.test" })},
          });
          throw new Error('R2 upload unexpectedly accepted ambient session token');
        } catch (error) { if (!error.message.includes('Remove S3_SESSION_TOKEN')) throw error; }
      `,
        ],
        { env: { ...childEnv, ...tokens } },
      );
      expect(child.stderr.toString()).toBe("");
      expect(child.exitCode).toBe(0);
    });
  }
}

test("global R2 endpoints are rejected for EU-only buckets", () => {
  expect(() =>
    getR2Config({
      ...env,
      R2_ENDPOINT: `https://${"a".repeat(32)}.r2.cloudflarestorage.com`,
    }),
  ).toThrow("EU");
});
