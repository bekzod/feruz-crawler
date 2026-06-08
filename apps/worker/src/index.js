import { createDb } from "@feruz-crawler/db";
import { startListingWorker } from "./workers/listing.js";
import { startDiscoveryWorker } from "./workers/discovery.js";
import { syncSchedules } from "./scheduler.js";

const { db, sql } = createDb();

startListingWorker({ db });
startDiscoveryWorker({ db });
await syncSchedules(db);

console.log("feruz-crawler worker started");

process.on("SIGTERM", async () => { await sql.end(); process.exit(0); });
process.on("SIGINT", async () => { await sql.end(); process.exit(0); });
