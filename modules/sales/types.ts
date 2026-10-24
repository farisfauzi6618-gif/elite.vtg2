export const REQUEST_STATUSES=['OPEN','MATCHED','CONTACTED','INTERESTED','CONVERTED','CLOSED','DO_NOT_CONTACT'] as const;
export const OUTCOMES=['DRAFT','SENT','REPLIED','INTERESTED','NO_RESPONSE','PURCHASED','NOT_INTERESTED'] as const;
export const ACTIVE_STATUSES=['OPEN','MATCHED','CONTACTED','INTERESTED'];
export type RequestStatus=typeof REQUEST_STATUSES[number];
export type Outcome=typeof OUTCOMES[number];
export type Preferences={brand?:string;category?:string;size?:string;colors?:string[];budgetMin?:number|null;budgetMax?:number|null;lengthMin?:number|null;lengthMax?:number|null;widthMin?:number|null;widthMax?:number|null};
export type Lead={id:string;name:string;instagram:string|null;customerId:string|null;customerName:string|null;customerArchived:boolean;source:string;contactPreference:string;doNotContact:boolean;notes:string;createdAt:number;updatedAt:number;version:number;lastOutreachAt:number|null;lastOutcome:Outcome|null};
export type WantedRequest={id:string;leadId:string;wanted:string;preferences:Preferences;notes:string;status:RequestStatus;createdAt:number;updatedAt:number;version:number};
export type Outreach={id:string;leadId:string;requestId:string;productId:string|null;groupId:string|null;draft:string;notes:string;outcome:Outcome;sentAt:number|null;orderId:string|null;createdAt:number;updatedAt:number;version:number;orderConfirmed:boolean;leadName?:string;instagram?:string|null};
export type Match={leadId:string;requestId:string;productId:string;groupId:string;colorId:string|null;productName:string;brand:string;category:string;color:string;size:string;lengthCm:number|null;widthCm:number|null;price:number;priority:'HIGH'|'MEDIUM'|'LOW';score:number;reasons:string[];missing:string[];nextAction:string;url:string};
export function leadLabel(lead:Pick<Lead,'name'|'instagram'|'customerName'>){return lead.instagram?'@'+lead.instagram:lead.name||lead.customerName||'Prospek tanpa nama'}
