/**
 * Centralized Costing Engine for Sahara Group General Transport (SGGT)
 * Single authoritative source of truth for Weighted Average Cost (WAC) and Profit math.
 */
export class CostingEngine {
  /**
   * Calculates new Weighted Average Cost (WAC) in cents.
   * Formula: New WAC = (Prior Stock * Prior WAC + Quantity In * Inflow Cost) / (Prior Stock + Quantity In)
   * Handles valid negative stock and non-negative stock math.
   */
  static calculateNewWac(
    priorStock: number,
    priorWac: number,
    qtyIn: number,
    costIn: number
  ): number {
    if (qtyIn <= 0) return priorWac
    const currentStock = Math.max(0, priorStock)
    const totalStock = currentStock + qtyIn

    if (totalStock <= 0) return costIn

    const totalValue = currentStock * priorWac + qtyIn * costIn
    return Math.round(totalValue / totalStock)
  }

  /**
   * Calculates profit in cents for a sale transaction.
   * Formula: Profit = Quantity * (Selling Rate - Cost Basis)
   */
  static calculateProfit(
    quantity: number,
    sellingRate: number,
    costBasis: number
  ): number {
    if (quantity <= 0) return 0
    return Math.round(quantity * (sellingRate - costBasis))
  }
}
