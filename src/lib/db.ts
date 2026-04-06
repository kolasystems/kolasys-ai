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
