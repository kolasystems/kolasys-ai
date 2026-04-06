// Kolasys AI — Redis / IORedis clients
// Two connections: one general-purpose, one for BullMQ (requires maxRetriesPerRequest: null).

import IORedis from 'ioredis'

// General-purpose Redis client (caching, pub/sub, etc.)
export const redis = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
})

// BullMQ-dedicated connection — maxRetriesPerRequest must be null per BullMQ docs.
export const bullmqConnection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})
