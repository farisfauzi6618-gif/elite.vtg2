'use client';
import {useEffect} from 'react';
import {usePathname} from 'next/navigation';
import {initAnalytics,resumeAnalytics,track} from '@/modules/analytics/client';
import {imageObservers} from '@/modules/analytics/images';
export function AnalyticsClient(){
 const path=usePathname();
 useEffect(()=>{
  void initAnalytics();const observer=imageObservers(track);
  const error=(event:Event)=>{if(event.target instanceof HTMLImageElement)observer.error(event.target)};
  const load=(event:Event)=>{if(event.target instanceof HTMLImageElement)observer.load(event.target)};
  const online=()=>{void resumeAnalytics()};
  document.addEventListener('error',error,true);document.addEventListener('load',load,true);window.addEventListener('online',online);
  return()=>{document.removeEventListener('error',error,true);document.removeEventListener('load',load,true);window.removeEventListener('online',online)};
 },[path]);
 return null;
}
