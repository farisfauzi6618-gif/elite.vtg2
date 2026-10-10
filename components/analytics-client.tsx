'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {initAnalytics,trackError} from '@/modules/analytics/client';
export function AnalyticsClient(){const path=usePathname();useEffect(()=>{void initAnalytics();const handler=(e:Event)=>{const el=e.target;if(el instanceof HTMLImageElement&&(el.classList.contains('detail-main-photo')||el.closest('.qris-frame')))trackError('critical_image')};document.addEventListener('error',handler,true);return()=>document.removeEventListener('error',handler,true)},[path]);return null}
