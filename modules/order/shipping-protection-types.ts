export type ProtectionMode='courier_api'|'jnt_counter';
export type ProtectionQuote={fee:number;declaredValue:number;source:'kiriminaja'|'jnt_counter';policyVersion:number;quotedAt:number};
export type ProtectionConfig={enabled:boolean;mode:ProtectionMode;rateBps:number;roundingUnit:number;version:number};
export type ProtectionFields={shipping_protection_fee:number|null;declared_shipping_value:number|null;shipping_protection_source:string|null};
export const legacyProtection:ProtectionFields={shipping_protection_fee:null,declared_shipping_value:null,shipping_protection_source:null};
