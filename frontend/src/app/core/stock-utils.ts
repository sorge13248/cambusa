import { StockItem } from './models.js';

export interface ProductHierarchyNode {
  id: string;
  parentProductId?: string | null;
}

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

/**
 * Builds a map of productId -> aggregated stock amount including the product's
 * own direct stock plus all descendants (children, grandchildren, etc.) at any depth.
 */
export function buildAggregatedStockMap(
  products: ProductHierarchyNode[],
  directStockMap: Map<string, number>,
): Map<string, number> {
  const childrenMap = new Map<string, string[]>();
  for (const p of products) {
    if (p.parentProductId) {
      const children = childrenMap.get(p.parentProductId) ?? [];
      children.push(p.id);
      childrenMap.set(p.parentProductId, children);
    }
  }

  const memo = new Map<string, number>();

  const compute = (productId: string, visited: Set<string>): number => {
    if (memo.has(productId)) return memo.get(productId)!;
    if (visited.has(productId)) return 0;
    visited.add(productId);

    let total = directStockMap.get(productId) ?? 0;
    const children = childrenMap.get(productId) ?? [];
    for (const childId of children) {
      total += compute(childId, visited);
    }

    visited.delete(productId);
    memo.set(productId, total);
    return total;
  };

  for (const p of products) {
    compute(p.id, new Set<string>());
  }
  for (const productId of directStockMap.keys()) {
    compute(productId, new Set<string>());
  }

  return memo;
}

/**
 * Calculates the aggregated stock amount for a single product including all
 * its descendants (children, grandchildren, etc.) at any nesting depth.
 */
export function calculateAggregatedProductStock(
  productId: string,
  products: ProductHierarchyNode[],
  stockItems: StockItem[],
): number {
  if (!productId) return 0;
  const directStockMap = new Map<string, number>();
  for (const item of stockItems || []) {
    directStockMap.set(item.productId, (directStockMap.get(item.productId) ?? 0) + (Number(item.amount) || 0));
  }
  const aggregatedMap = buildAggregatedStockMap(products || [], directStockMap);
  return aggregatedMap.get(productId) ?? 0;
}
