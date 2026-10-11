type RefreshEnvironment={window:Pick<Window,'addEventListener'|'removeEventListener'>;document:Pick<Document,'addEventListener'|'removeEventListener'|'visibilityState'>;setInterval:typeof setInterval;clearInterval:typeof clearInterval;setTimeout:typeof setTimeout;clearTimeout:typeof clearTimeout};

// Keep active-tab intervals, skip background work, coalesce resume events.
export function visibleRefresh(refresh:()=>void,intervalMs?:number,environment?:RefreshEnvironment){
 const e=environment??{window,document,setInterval:window.setInterval.bind(window),clearInterval:window.clearInterval.bind(window),setTimeout:window.setTimeout.bind(window),clearTimeout:window.clearTimeout.bind(window)};
 let resume:ReturnType<typeof setTimeout>|undefined;
 const tick=()=>{if(e.document.visibilityState==='visible')refresh()};
 const wake=()=>{if(resume!==undefined)e.clearTimeout(resume);resume=undefined;if(e.document.visibilityState==='visible')resume=e.setTimeout(()=>{resume=undefined;tick()},100)};
 const timer=intervalMs?e.setInterval(tick,intervalMs):undefined;
 e.window.addEventListener('focus',wake);e.window.addEventListener('pageshow',wake);e.document.addEventListener('visibilitychange',wake);
 return()=>{if(timer!==undefined)e.clearInterval(timer);if(resume!==undefined)e.clearTimeout(resume);e.window.removeEventListener('focus',wake);e.window.removeEventListener('pageshow',wake);e.document.removeEventListener('visibilitychange',wake)};
}
