import {db} from './server';
// Indexed references are maintained atomically by product mutation triggers.
// Keep the live product gate; neither cached bytes nor client flags grant access.
export async function publishedPhoto(key:string){
 return !!await db().prepare("SELECT r.product_id FROM photo_public_references r JOIN products p ON p.id=r.product_id WHERE r.photo_key=? AND p.status='published' AND p.deleted_at IS NULL LIMIT 1").bind(key).first();
}
