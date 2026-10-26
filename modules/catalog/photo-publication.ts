import {db} from './server';

// A public image must be referenced by a published product or one of its active colors.
// This deliberately has no owner/draft fallback.
export async function publishedPhoto(key:string){
 return !!await db().prepare("SELECT id FROM products WHERE status='published' AND deleted_at IS NULL AND (photo_key=? OR EXISTS (SELECT 1 FROM json_each(products.photo_keys) WHERE value=?) OR EXISTS (SELECT 1 FROM json_each(products.color_variants) c WHERE json_extract(c.value,'$.active')=1 AND (json_extract(c.value,'$.photoKey')=? OR json_extract(c.value,'$.swatchImage')=? OR EXISTS (SELECT 1 FROM json_each(c.value,'$.photoKeys') gallery WHERE gallery.value=?)))) LIMIT 1").bind(key,key,key,key,key).first();
}
