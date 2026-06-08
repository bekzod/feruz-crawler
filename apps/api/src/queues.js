import { Queue } from "bullmq";
import { createRedisConnection, QUEUE_DISCOVERY, QUEUE_LISTING } from "@feruz-crawler/shared";
const connection = createRedisConnection();
export const discoveryQueue = new Queue(QUEUE_DISCOVERY, { connection });
export const listingQueue = new Queue(QUEUE_LISTING, { connection });
