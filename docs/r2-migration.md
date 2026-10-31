# R2 migration runbook (opt-in; no infrastructure changes)

`OBJECT_STORAGE_PROVIDER=s3` remains the default. This patch does not create
buckets, change production settings, copy objects, delete S3 data, or rewrite
stored URLs. No secrets belong in Git or a frontend bundle.

## Server environment

```dotenv
OBJECT_STORAGE_PROVIDER=s3
# Change to r2 only after the checks below pass in staging.
R2_ACCOUNT_ID=<32-character-account-id>
# Optional override; only the EU jurisdiction endpoint is accepted:
# R2_ENDPOINT=https://<account-id>.eu.r2.cloudflarestorage.com
R2_BUCKET=<dedicated-bucket>
R2_ACCESS_KEY_ID=<bucket-scoped-object-read-write-key>
R2_SECRET_ACCESS_KEY=<secret>
R2_PUBLIC_BASE_URL=https://<public-media-custom-domain>
```

All new buckets must be provisioned in the **EU jurisdiction** (a region hint
alone is not jurisdiction). R2 uses the account-level EU HTTPS endpoint, SigV4
region `auto` (not `eu`), explicit R2 credentials,
path-style requests, and no AWS ACL/grant or transfer-acceleration settings.
Missing R2 configuration fails rather than silently falling back to AWS.
Keep existing `S3_BUCKET`, `S3_REGION` and AWS settings securely available for rollback.
For Bun R2 mode, remove `S3_SESSION_TOKEN` and `AWS_SESSION_TOKEN` from the worker
process and restart: Bun 1.4.3 otherwise inherits them even with an empty explicit
token. A local presigning check fails closed if either token was inherited.
Use separate credentials and buckets for public media and sensitive objects;
R2 visibility is configured at bucket/domain level, not with per-object ACLs.

## Release checklist (operator action, not performed by this PR)

The worker already runs Bun (Docker pins 1.4.3). R2 uses Bun's native
`S3Client.write` rather than adding a third-party dependency. The existing AWS SDK
is retained only for the S3 rollback branch and its credential-chain behavior.
See [Bun S3 API](https://bun.sh/docs/runtime/s3).

1. Provision a **public listing-photo-only EU-jurisdiction** bucket with a production custom
   domain. Keep all private artifacts/credentials in separate private storage.
   `R2_PUBLIC_BASE_URL` cannot be the private API endpoint. No object ACL is sent.
2. Deploy with S3 still selected, then test a known listing in staging with R2.
   Keys retain the current `S3_IMAGE_PREFIX` and deterministic listing layout.
   Download failures and upload failures retain the existing original-photo
   fallback; verify the `raw.photoUploadErrors` field when observing rollout.
3. Check custom-domain GETs, correct Content-Type and listing-photo rendering.
   Delivery configuration is validated before downloading or writing an image.
   No browser PUT CORS is required for this server-side worker flow.

- Preserve original S3 objects and URLs. This code only changes **new writes**.
  Any historical migration needs a separate inventory, copy, metadata/checksum
  verification and URL-mapping plan. Do not mass-replace URL hosts or assume a
  provider switch copies data. Existing reads must keep working during rollout.
- In an isolated staging bucket, test upload, retrieval, MIME type, deletion,
  denied anonymous access for private objects, and expired signed URLs. Verify
  both small and multipart-sized objects where applicable. Use no real receipts
  in public test buckets. Run `bun test apps/worker/src/s3` for offline regression checks.
- Monitor upload failures/latency and downstream reads, never log signed URLs or
  keys. Keep this PR draft until credentialed staging tests and operational review
  are complete; mock/offline tests cannot prove bucket privacy, CORS or DNS.

## Rollback

Restart with `OBJECT_STORAGE_PROVIDER=s3` and the original AWS settings to route
**future writes** to S3. Keep R2 and its delivery domain/credentials available for
R2-created objects; reverting code or the flag does not move them back. Roll back
historical URL/data changes only with the separately verified migration plan.
Existing mirrored R2 photo URLs remain in listing records after rollback; keep their public delivery domain alive.

## References

- [Cloudflare S3 compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [Private presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [Public buckets and custom domains](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [CORS configuration](https://developers.cloudflare.com/r2/buckets/cors/)
