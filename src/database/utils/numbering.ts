import { transactions } from '../schema/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'
import { db } from '../db'
import { PREFIXES } from '../constants'

export type NumberingType = 'PURCHASE' | 'SALE' | 'TRANSFER' | 'RETURN' | 'ADJUSTMENT' | 'OPENING_BALANCE'

/**
 * Resolves the transaction prefix from constants based on type
 */
export function getPrefix(type: NumberingType): string {
  switch (type) {
    case 'PURCHASE':
      return PREFIXES.PURCHASE
    case 'SALE':
      return PREFIXES.SALE
    case 'TRANSFER':
      return PREFIXES.TRANSFER
    case 'RETURN':
      return PREFIXES.RETURN
    case 'ADJUSTMENT':
      return PREFIXES.ADJUSTMENT
    case 'OPENING_BALANCE':
      return PREFIXES.OPENING_BALANCE
  }
}

/**
 * Generates the next sequential transaction number.
 * Runs atomically by accepting the active transaction database client (tx).
 */
export async function generateNextTransactionNumber(
  type: NumberingType,
  txClient: typeof db = db
): Promise<string> {
  const prefix = getPrefix(type)

  // Find the highest transaction number matching the prefix
  const result = await txClient
    .select()
    .from(transactions)
    .where(and(eq(transactions.transactionType, type), isNull(transactions.deletedAt)))
    .orderBy(desc(transactions.transactionNumber))
    .limit(1)

  if (result.length === 0) {
    return `${prefix}000001`
  }

  const latestNum = result[0].transactionNumber // e.g. "PUR-000045"
  
  // Extract digits following the prefix separator
  const parts = latestNum.split('-')
  const numericPart = parts[parts.length - 1] // "000045"
  
  const currentVal = parseInt(numericPart, 10)
  const nextVal = isNaN(currentVal) ? 1 : currentVal + 1
  const padded = String(nextVal).padStart(6, '0') // "000046"

  return `${prefix}${padded}`
}
