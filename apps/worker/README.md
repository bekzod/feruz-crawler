# @feruz-crawler/worker

## Sold detection

After each discovery run, `markMisses(db, site, seenIds)` increments `consecutiveMisses` on every active listing for the given site whose `sourceListingId` was not present in the run. Once a listing accumulates 3 consecutive misses its `status` is flipped to `sold_removed`.

Known limitation: the counter is site-scoped, so results are most accurate when only one preset per site is active at a time. When multiple presets cover the same site, a listing absent from one preset's run will be incremented even if it appeared in another preset's run. Multi-preset overlap handling is a future refinement (see Task 26).
