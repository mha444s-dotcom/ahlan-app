// Extracted from the approved Discover page. Preserve source content and behavior.
export function installAmbientEffects(env) {
const {document,window,history,location,localStorage,requestAnimationFrame,cancelAnimationFrame,setTimeout,clearTimeout,matchMedia,IntersectionObserver,ResizeObserver,performance,getComputedStyle,fetch,alert,devicePixelRatio,queueMicrotask,Event} = env;
const assetURL = env.assetURL;

(function(){
  const gallery=document.getElementById('heritage-gallery');
  const strip=document.getElementById('heritage-categories');
  if(!gallery||!strip) return;
  if(!gallery.querySelector('.heritage-dust-field')){
    const field=document.createElement('div');
    field.className='heritage-dust-field';
    const specs=[
      [8,18,0,0],[16,72,4,-6],[24,54,8,-11],[36,84,12,-2],[48,20,16,-10],[57,67,2,-15],
      [68,34,10,-5],[76,82,6,-14],[84,12,14,-8],[90,58,18,-3],[12,42,20,-12],[62,10,9,-7]
    ];
    specs.forEach(([left,top,delay,drift])=>{
      const s=document.createElement('span');
      s.className='heritage-dust';
      s.style.left=left+'%';
      s.style.top=top+'%';
      s.style.animationDelay='-'+delay+'s';
      s.style.transform='translate3d(0,0,0)';
      s.style.setProperty('--drift', drift+'px');
      field.appendChild(s);
    });
    gallery.prepend(field);
  }
  let paused=false;
  let dir=1;
  let last=0;let frameId=0;
  function maxScroll(){return Math.max(0, strip.scrollWidth - strip.clientWidth);}
  function frame(ts){frameId=0;if(paused)return;
    if(!last) last=ts;
    const dt=Math.min(32, ts-last); last=ts;
    const max=maxScroll();
    if(!paused && !document.body.classList.contains('heritage-screen-open') && max>8){
      strip.scrollLeft += dir * dt * 0.018;
      if(strip.scrollLeft >= max-1) dir=-1;
      else if(strip.scrollLeft <= 1) dir=1;
    }
    frameId=requestAnimationFrame(frame);
  }
  const stop=()=>{paused=true;last=0;cancelAnimationFrame(frameId);frameId=0};
  const play=()=>{paused=false;if(!frameId)frameId=requestAnimationFrame(frame);};
  ['mouseenter','pointerdown','touchstart','focusin'].forEach(evt=>strip.addEventListener(evt,stop,{passive:true}));
  ['mouseleave','focusout'].forEach(evt=>strip.addEventListener(evt,play));
  strip.addEventListener('touchend',()=>setTimeout(play,1400),{passive:true});
  frameId=requestAnimationFrame(frame);
})();

}
export function finalizeEffects(env) {
const {document,window,history,location,localStorage,requestAnimationFrame,cancelAnimationFrame,setTimeout,clearTimeout,matchMedia,IntersectionObserver,ResizeObserver,performance,getComputedStyle,fetch,alert,devicePixelRatio,queueMicrotask,Event} = env;
const assetURL = env.assetURL;

(function(){
  const strip=document.getElementById('heritage-categories');
  const title=document.getElementById('heritage-preview-title');
  const caption=document.getElementById('heritage-preview-caption');
  const legend=document.querySelector('#heritage-gallery .tomb-legend strong');
  const legendSub=document.querySelector('#heritage-gallery .tomb-legend small');
  if(title) title.textContent='';
  if(caption) caption.textContent='';
  if(legend) legend.textContent='وراء الحجر… أسرار الخلود';
  if(legendSub) legendSub.textContent='اختر تصنيفًا من الأعلى لتُفتح بوابة الحضارة';
  if(strip){
    const pauseAuto=()=>strip.dispatchEvent(new Event('mouseenter'));
    pauseAuto();
    ['mouseleave','focusout','touchend'].forEach(evt=>{
      strip.addEventListener(evt,()=>setTimeout(pauseAuto,0),true);
    });
  }
})();

}
export function installEffects(env) {
installAmbientEffects(env);
finalizeEffects(env);
}
