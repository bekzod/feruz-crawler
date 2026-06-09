import { expect, test } from "bun:test";
import { processListingJob } from "./listing.js";

test("processListingJob mirrors parsed photos before upserting", async () => {
  const parsed = {
    source: "goonet",
    sourceListingId: "1",
    url: "https://example.test/listing",
    photos: ["https://source/1.jpg"],
  };
  let mirroredInput;
  let upsertInput;

  const result = await processListingJob(
    { data: { site: "goonet", url: "https://example.test/listing" } },
    {
      db: {},
      deps: { cache: {}, openai: {} },
      telegram: { send: async () => {} },
      getAdapterImpl: () => ({
        parseListingPage: async () => parsed,
      }),
      fetchDocumentImpl: async () => ({ document: true }),
      mirrorListingPhotosImpl: async (canonical) => {
        mirroredInput = canonical;
        return { ...canonical, photos: ["https://s3/1.jpg"] };
      },
      upsertListingImpl: async (_db, canonical) => {
        upsertInput = canonical;
        return { listing: { id: "listing-1", ...canonical }, isNew: false };
      },
      notifyMatchesImpl: async () => {
        throw new Error("should not notify existing listings");
      },
    },
  );

  expect(mirroredInput).toBe(parsed);
  expect(upsertInput.photos).toEqual(["https://s3/1.jpg"]);
  expect(result).toEqual({ id: "listing-1", isNew: false });
});

test("processListingJob notifies when mirrored listing is new", async () => {
  let notifiedListing;

  await processListingJob(
    { data: { site: "carsensor", url: "https://example.test/listing" } },
    {
      db: {},
      deps: {},
      telegram: {},
      getAdapterImpl: () => ({
        parseListingPage: async () => ({
          source: "carsensor",
          sourceListingId: "2",
          photos: ["https://source/2.jpg"],
        }),
      }),
      fetchDocumentImpl: async () => ({}),
      mirrorListingPhotosImpl: async (canonical) => ({ ...canonical, photos: ["https://s3/2.jpg"] }),
      upsertListingImpl: async (_db, canonical) => ({
        listing: { id: "listing-2", ...canonical },
        isNew: true,
      }),
      notifyMatchesImpl: async (_db, listing) => {
        notifiedListing = listing;
      },
    },
  );

  expect(notifiedListing.photos).toEqual(["https://s3/2.jpg"]);
});
