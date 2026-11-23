import { StockItem } from './models.js';

/**
 * Centralized calculation of total inventory amount in pantry for a product.
 * Returns the exact sum of all active stock item quantities for that product.
 */
export function calculateProductTotalStock(productId: string, stockItems: StockItem[]): number {
  if (!productId || !stockItems || stockItems.length === 0) return 0;
  return stockItems
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
}
