import type {Product} from './catalog-types';

export function compactProductSize(product:Pick<Product,'category'|'name'>){
  return ['Topi','Aksesoris'].includes(product.category)||/\b(?:cap|hat|topi|beanie)\b/i.test(product.name);
}
