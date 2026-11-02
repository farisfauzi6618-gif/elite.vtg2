'use client';
import {useSyncExternalStore} from 'react';
const subscribe=()=>()=>{};
const clientSnapshot=()=>true;
const serverSnapshot=()=>false;
// Mount fragment-token forms only on the client, with matching server hydration.
export const useClientReady=()=>useSyncExternalStore(subscribe,clientSnapshot,serverSnapshot);
