export function compareByName<T extends { name?: string | null }>(a: T, b: T): number {
  const nameA = a.name ?? '';
  const nameB = b.name ?? '';
  return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' }) || nameA.localeCompare(nameB);
}

export function compareByNumericOrder<T extends { sortOrder?: number | null; name?: string | null }>(a: T, b: T): number {
  const rawA = a.sortOrder !== null && a.sortOrder !== undefined ? Number(a.sortOrder) : Number.MAX_SAFE_INTEGER;
  const rawB = b.sortOrder !== null && b.sortOrder !== undefined ? Number(b.sortOrder) : Number.MAX_SAFE_INTEGER;
  const orderA = Number.isFinite(rawA) ? rawA : Number.MAX_SAFE_INTEGER;
  const orderB = Number.isFinite(rawB) ? rawB : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) {
    return orderA - orderB;
  }
  return compareByName(a, b);
}
