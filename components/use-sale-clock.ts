'use client';
import {useEffect,useState} from 'react';
// Use the API's time and a monotonic clock while the page is open.
export function useSaleClock(asOf:string,latestRelease:number) {
 const [now,setNow]=useState(0);
 useEffect(()=>{
  const serverTime=Date.parse(asOf)||Date.now(),started=performance.now();
  const tick=()=>setNow(serverTime+performance.now()-started);tick();
  if(latestRelease<=serverTime)return;
  const timer=setInterval(()=>{const time=serverTime+performance.now()-started;setNow(time);if(time>=latestRelease)clearInterval(timer)},1000);
  return()=>clearInterval(timer);
 },[asOf,latestRelease]);
 return now;
}
