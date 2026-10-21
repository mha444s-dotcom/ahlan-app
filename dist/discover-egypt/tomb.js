// Extracted from the approved Discover page. Preserve source content and behavior.
export function installTomb(env) {
const {document,window,history,location,localStorage,requestAnimationFrame,cancelAnimationFrame,setTimeout,clearTimeout,matchMedia,IntersectionObserver,ResizeObserver,performance,getComputedStyle,fetch,alert,devicePixelRatio,queueMicrotask,Event} = env;
const assetURL = env.assetURL;

(()=>{
const gallery=document.getElementById('heritage-gallery');
const nav=document.getElementById('heritage-categories');
const cards=document.getElementById('heritage-preview');
const heading=gallery?.querySelector('.heritage-preview-heading');
if(!gallery||!nav||!cards||!heading)return;
const stage=document.createElement('div');stage.className='tomb-experience tomb-resetting';stage.id='heritage-tomb-stage';
stage.setAttribute('aria-label','بوابة الحضارة المصرية التفاعلية');
stage.innerHTML=`<div class="tomb-view" id="heritage-tomb-view"><div class="tomb-world">
<img class="tomb-back" alt="مدخل مقبرة فرعونية قديمة" src="${assetURL("assets/6db1234688dff988211f94715b33a602145d2c128ac4f0283d6d5cf31f182cc2.webp")}">
<div class="tomb-stone tomb-stone-left"><img alt="" src="${assetURL("assets/225f7ee70548d876980b8c8be2c943815dedc8f734340c4b0e5b0ddab30f6652.webp")}"></div>
<div class="tomb-stone tomb-stone-right"><img alt="" src="${assetURL("assets/5e34da7faeba4b95b64760734690fbdea24cedfac46ec68af6e3b3f6167d759a.webp")}"></div>
<div class="tomb-flame"></div></div><div class="tomb-vignette"></div>
<div class="tomb-legend"><strong>وراء الحجر… أسرار الخلود</strong><small>اختر تصنيفًا من الأعلى لتُفتح بوابة الحضارة</small></div>
<canvas id="heritage-tomb-dust" class="tomb-dust" aria-hidden="true"></canvas>
<div class="tomb-mist"></div></div>
<div class="tomb-models"><div class="tomb-models-title"><span id="tomb-current-category">مختارات من الحضارة</span><small>اضغط لعرض التفاصيل</small></div></div>`;
heading.after(stage);
const results=stage.querySelector('.tomb-models');results.appendChild(cards);
const world=stage.querySelector('.tomb-world'),canvas=stage.querySelector('canvas'),ctx=canvas.getContext('2d');
let version=0,dustFrame=0,dustParts=[],chosenInitial=true;
const reduceMotion=window.matchMedia('(prefers-reduced-motion:reduce)');
function positionWorld(){const W=stage.clientWidth,H=stage.clientHeight,r=1672/941;
 const w=Math.max(W,H*r);world.style.width=w+'px';world.style.height=(w/r)+'px';
}
function sizeCanvas(){const dpr=Math.min(1.5,devicePixelRatio||1),r=stage.getBoundingClientRect();canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));}
function eraseDust(){cancelAnimationFrame(dustFrame);canvas.style.opacity=0;ctx.clearRect(0,0,canvas.width,canvas.height)}
function dust(duration=2450){eraseDust();sizeCanvas();const W=canvas.width,H=canvas.height;
 dustParts=Array.from({length:170},()=>({x:W*(.48+Math.random()*.06),y:H*(.55+Math.random()*.18),vx:(Math.random()-.5)*W*(.35+Math.random()*.5),vy:(Math.random()-.5)*H*(.25+Math.random()*.5),r:(2+Math.random()*25)*Math.max(1,W/1300),alpha:.09+Math.random()*.18}));
 const sprite=document.createElement('canvas');sprite.width=sprite.height=64;const sc=sprite.getContext('2d'),g=sc.createRadialGradient(32,32,2,32,32,32);g.addColorStop(0,'rgba(250,219,168,.62)');g.addColorStop(.43,'rgba(227,177,110,.34)');g.addColorStop(1,'rgba(185,121,66,0)');sc.fillStyle=g;sc.fillRect(0,0,64,64);
 const start=performance.now();canvas.style.opacity=1;
 function frame(now){const p=Math.min(1,(now-start)/duration);ctx.clearRect(0,0,W,H);
 for(const d of dustParts){const r=d.r*(1+p*6),x=d.x+d.vx*p,y=d.y+d.vy*p;ctx.globalAlpha=d.alpha*(1-p*.15);ctx.drawImage(sprite,x-r,y-r,r*2,r*2)}
 ctx.globalAlpha=1;if(p<1)dustFrame=requestAnimationFrame(frame);}
 dustFrame=requestAnimationFrame(frame);
}
function resetImmediately(){
 version++;
 stage.className='tomb-experience tomb-resetting';
 gallery.classList.remove('heritage-items-revealed');
 eraseDust();
 stage.querySelector('.tomb-models').setAttribute('aria-hidden','true');
 stage.offsetWidth; // paint the original CLOSED tomb without a reverse animation
}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function selectCategory(category){
 resetImmediately();const myVersion=version;
 document.getElementById('tomb-current-category').textContent=category;
 positionWorld();
 if(!reduceMotion.matches){
   stage.scrollIntoView({behavior:'smooth',block:'center'});
   await wait(230);
 }
 if(myVersion!==version)return;
 stage.classList.remove('tomb-resetting');stage.offsetWidth;
 if(reduceMotion.matches){stage.classList.add('tomb-complete');results.setAttribute('aria-hidden','false');gallery.classList.add('heritage-items-revealed');return;}
 stage.classList.add('tomb-rumble');
 await wait(700);if(myVersion!==version)return;
 stage.classList.remove('tomb-rumble');stage.classList.add('tomb-opening');dust();
 await wait(700);if(myVersion!==version)return;
 stage.classList.add('tomb-push');
 await wait(720);if(myVersion!==version)return;
 stage.classList.add('tomb-cloud');
 await wait(510);if(myVersion!==version)return;
 stage.classList.add('tomb-complete');
 results.setAttribute('aria-hidden','false');
 gallery.classList.add('heritage-items-revealed');
 setTimeout(()=>{if(myVersion===version)eraseDust()},1000);
}
nav.addEventListener('click',e=>{
 const b=e.target.closest('[data-heritage-entry]');if(!b)return;
 // Reset before the app's existing handler builds the four cards, then animate after.
 resetImmediately();const name=b.dataset.heritageEntry;
 queueMicrotask(()=>selectCategory(name));
},true);
positionWorld();sizeCanvas();resetImmediately();stage.classList.remove('tomb-resetting');
const observer=new ResizeObserver(()=>{positionWorld();sizeCanvas()});observer.observe(stage);
})();

}
