import {availableGroups,type Product} from './catalog-types';
import {transactionPrice} from './sale-price';
import {brandKey} from './brands';
import {orderingLocked} from './product-schedule';
export function relatedProducts(parent:Product,products:Product[],now=Date.now()){
 const sizes=new Set(parent.groups.flatMap(g=>g.fits)),brand=brandKey(parent.brand),prices=parent.groups.map(g=>transactionPrice(parent,g)).filter((p):p is number=>p!=null&&p>0),reference=prices.length?Math.min(...prices):parent.price;
 return products.filter(p=>p.id!==parent.id&&p.status==='published'&&!p.deletedAt&&p.category===parent.category&&availableGroups(p).length&&!orderingLocked(p,now)).map(p=>({product:p,score:(brand&&brand!=='brand belum diketahui'&&brandKey(p.brand)===brand?4:0)+(availableGroups(p).some(g=>g.fits.some(f=>sizes.has(f)))?3:0)+(reference&&availableGroups(p).some(g=>{const value=transactionPrice(p,g);return value!=null&&Math.abs(value-reference)/reference<=0.3})?1:0)})).sort((a,b)=>b.score-a.score||a.product.id.localeCompare(b.product.id)).slice(0,4).map(row=>row.product);
}
