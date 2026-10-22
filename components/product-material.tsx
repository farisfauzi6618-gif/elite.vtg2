import {materialPresentation,type ProductMaterial as MaterialData} from '@/modules/catalog/material';

export function ProductMaterial({product}:{product:MaterialData}){
 const material=materialPresentation(product);if(!material)return null;
 return <><dt>Material</dt><dd className="product-material-value"><span>{material.title}</span>{material.composition&&<span className="material-secondary">{material.composition}</span>}{material.details&&<span className="material-secondary">{material.details}</span>}</dd></>;
}
