import { expect, test } from "bun:test";
import { buildImageKey, buildPublicUrl, mirrorListingPhotos, uploadListingPhoto } from "./images.js";

test("buildPublicUrl uses regional S3 host when region exists", () => {
  expect(buildPublicUrl("listings/goonet/1/00-photo.jpg", {
    bucket: "cars",
    region: "ap-northeast-1",
  })).toBe("https://cars.s3.ap-northeast-1.amazonaws.com/listings/goonet/1/00-photo.jpg");
});

test("buildPublicUrl uses generic S3 host without region", () => {
  expect(buildPublicUrl("listings/goonet/1/00-photo.jpg", {
    bucket: "cars",
    region: "",
  })).toBe("https://cars.s3.amazonaws.com/listings/goonet/1/00-photo.jpg");
});

test("buildImageKey is deterministic and scoped by listing", () => {
  const input = {
    source: "goonet",
    sourceListingId: "965026060100561098002",
    index: 0,
    url: "https://picture1.goo-net.com/123/J/1234567.jpg?x=1",
  };

  expect(buildImageKey(input, { prefix: "cars" })).toBe(buildImageKey(input, { prefix: "cars" }));
  expect(buildImageKey(input, { prefix: "cars" })).toMatch(
    /^cars\/goonet\/965026060100561098002\/00-[a-f0-9]{12}-1234567.jpg$/,
  );
});

test("uploadListingPhoto downloads and uploads with public-read ACL and content type", async () => {
  let capturedParams;
  class FakeUploader {
    constructor({ params }) {
      capturedParams = params;
    }

    async done() {}
  }

  const result = await uploadListingPhoto(
    "https://picture1.goo-net.com/123/J/1234567.jpg",
    { source: "goonet", sourceListingId: "listing-1" },
    0,
    {
      bucket: "cars",
      region: "ap-northeast-1",
      prefix: "listings",
      client: {},
      Uploader: FakeUploader,
      fetchImpl: async () => ({
        ok: true,
        headers: { get: () => "image/jpeg; charset=binary" },
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      }),
    },
  );

  expect(result).toMatch(/^https:\/\/cars\.s3\.ap-northeast-1\.amazonaws\.com\/listings\/goonet\/listing-1\/00-/);
  expect(capturedParams.Bucket).toBe("cars");
  expect(capturedParams.ACL).toBe("public-read");
  expect(capturedParams.ContentType).toBe("image/jpeg");
  expect([...capturedParams.Body]).toEqual([1, 2, 3]);
});

test("mirrorListingPhotos replaces photos when all uploads succeed", async () => {
  const canonical = {
    source: "goonet",
    sourceListingId: "1",
    photos: ["https://source/1.jpg", "https://source/2.jpg"],
    raw: { specMap: {} },
  };

  const result = await mirrorListingPhotos(canonical, {
    uploadPhoto: async (_url, _listing, index) => `https://s3/photo-${index}.jpg`,
  });

  expect(result.photos).toEqual(["https://s3/photo-0.jpg", "https://s3/photo-1.jpg"]);
  expect(result.raw).toEqual({ specMap: {} });
});

test("mirrorListingPhotos keeps successful uploads and records failed uploads", async () => {
  const canonical = {
    source: "carsensor",
    sourceListingId: "2",
    photos: ["https://source/1.jpg", "https://source/2.jpg"],
    raw: { specMap: {} },
  };

  const result = await mirrorListingPhotos(canonical, {
    uploadPhoto: async (url, _listing, index) => {
      if (index === 1) throw new Error("upload failed");
      return `https://s3/${url.split("/").pop()}`;
    },
  });

  expect(result.photos).toEqual(["https://s3/1.jpg"]);
  expect(result.raw.photoUploadErrors).toEqual([
    { url: "https://source/2.jpg", error: "upload failed" },
  ]);
});

test("mirrorListingPhotos falls back to original photos when all uploads fail", async () => {
  const canonical = {
    source: "carsensor",
    sourceListingId: "3",
    photos: ["https://source/1.jpg", "https://source/2.jpg"],
    raw: {},
  };

  const result = await mirrorListingPhotos(canonical, {
    uploadPhoto: async () => {
      throw new Error("no s3");
    },
  });

  expect(result.photos).toEqual(canonical.photos);
  expect(result.raw.photoUploadErrors).toHaveLength(2);
});
