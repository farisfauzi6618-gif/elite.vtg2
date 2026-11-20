// Never accept query strings, fragments, invoice identifiers or capabilities.
export function analyticsPath(path:unknown):path is string {
 return typeof path==='string'&&/^(\/$|\/produk\/[^/?#]+$|\/recently-sold\/?$|\/order\/?$|\/order\/lanjutkan\/?$|\/pesanan\/?$|\/lacak\/?$|\/ongkir\/?$)/.test(path);
}
