import { PrismaClient } from '@/generated/prisma/client'
import { PrismaNeonHttp } from '@prisma/adapter-neon'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }
  // PrismaNeonHttp uses Neon's HTTP/fetch transport.
  // No WebSocket, no ws package, works in all Next.js server environments.
  const adapter = new PrismaNeonHttp(connectionString, {})
  return new PrismaClient({ adapter })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// NEON HTTP ADAPTER — KNOWN LIMITATION
// prisma.$transaction() and operations that implicitly open interactive
// transactions (upsert, updateMany in some cases) throw:
// "Transactions are not supported in HTTP mode"
//
// Pattern to use instead of upsert:
//   const existing = await db.model.findUnique({ where: {...} })
//   if (!existing) await db.model.create({ data: {...} })
//
// Pattern to use instead of updateMany:
//   const record = await db.model.findFirst({ where: {...} })
//   if (record) await db.model.update({ where: { id: record.id }, data: {...} })
