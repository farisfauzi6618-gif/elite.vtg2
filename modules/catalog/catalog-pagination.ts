export const PRODUCTS_PER_PAGE = 40;

export function parseCatalogPage(value: string | null): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) ? page : 1;
}

export function catalogPage<T>(products: readonly T[], requestedPage: number) {
  const pageCount = Math.max(1, Math.ceil(products.length / PRODUCTS_PER_PAGE));
  const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1));
  const start = (page - 1) * PRODUCTS_PER_PAGE;
  return {page, pageCount, start, items: products.slice(start, start + PRODUCTS_PER_PAGE)};
}

export function catalogPageNumbers(page: number, pageCount: number): number[] {
  return [...new Set([1, page - 1, page, page + 1, pageCount])]
    .filter(value => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);
}
