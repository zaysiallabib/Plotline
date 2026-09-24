import {Geometry} from '../core/Geometry.js';import {Units} from '../core/Units.js';
const FLOOR={tile:0xd8d6cc,wood:0xb98a55,marble:0xedeae2,cement:0x9a9a92};
export class ThreeRenderer{
 constructor(state){this.s=state;this.scene=null;this.camera=null;this.renderer=null;this.group=null;this.sun=null;this.keys={};this.yaw=0;this.pitch=0;this.measureMode=false;this.a=null;this.line=null;this.locked=false;this.speed=0.12;this.roomData=[]}
 init(){const c=document.getElementById('threeCanvas');this.renderer=new THREE.WebGLRenderer({canvas:c,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0xe4e4e0);this.camera=new THREE.PerspectiveCamera(70,1,.1,2000);this.camera.rotation.order='YXZ';this.camera.position.set(0,5.5,0);this.scene.add(new THREE.HemisphereLight(0xffffff,0x777770,.8));this.sun=new THREE.DirectionalLight(0xffffff,1.1);this.sun.castShadow=true;this.sun.shadow.mapSize.set(1024,1024);this.scene.add(this.sun);const ground=new THREE.Mesh(new THREE.PlaneGeometry(2000,2000),new THREE.MeshStandardMaterial({color:0xd0d0cc,roughness:1}));ground.rotation.x=-Math.PI/2;this.scene.add(ground);this.group=new THREE.Group();this.scene.add(this.group);this._bindControls(c);addEventListener('resize',()=>this.resize());this.resize();this.animate()}
 _bindControls(c){
  // Pointer Lock for true FPS look
  c.addEventListener('click',()=>{if(!this.measureMode&&!this.locked)c.requestPointerLock()});
  document.addEventListener('pointerlockchange',()=>{
   this.locked=document.pointerLockElement===c;
   const hud=document.getElementById('viewHud');
   const cross=document.getElementById('crosshair');
   if(this.locked){if(hud)hud.style.opacity='0';if(cross)cross.style.display='block';}
   else{if(hud)hud.style.opacity='1';if(cross)cross.style.display='none';}
   const fs=document.getElementById('fsBtn');if(fs)fs.style.display=this.locked?'none':'flex';
  });
  document.addEventListener('mousemove',e=>{
   if(!this.locked)return;
   this.yaw-=e.movementX*0.002;
   this.pitch-=e.movementY*0.002;
   this.pitch=Math.max(-1.4,Math.min(1.4,this.pitch));
   this.camera.rotation.set(this.pitch,this.yaw,0);
  });
  // Fullscreen button
  const container=document.getElementById('view3d-container');
  const fsBtn=document.createElement('button');
  fsBtn.id='fsBtn';fsBtn.className='fs-btn';fsBtn.title='Fullscreen';
  fsBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 2h4M2 2v4M14 2h-4M14 2v4M2 14h4M2 14v-4M14 14h-4M14 14v-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Fullscreen';
  fsBtn.onclick=()=>{if(!document.fullscreenElement)container.requestFullscreen();else document.exitFullscreen();};
  container.appendChild(fsBtn);
  document.addEventListener('fullscreenchange',()=>{
   if(!document.fullscreenElement){document.exitPointerLock();fsBtn.style.display='flex';}
   this.resize();
  });
  // Keyboard
  addEventListener('keydown',e=>{
   this.keys[e.key.toLowerCase()]=true;
   if(e.key==='m'||e.key==='M')this.toggleMeasure();
   if(e.key==='c'||e.key==='C')this.toggleCeilings();
   if(e.key==='Escape'){document.exitPointerLock();if(document.fullscreenElement)document.exitFullscreen();}
  });
  addEventListener('keyup',e=>this.keys[e.key.toLowerCase()]=false);
  c.addEventListener('click',e=>{if(this.measureMode&&this.locked)this.measure(e)});
 }
 toggleMeasure(){this.measureMode=!this.measureMode;const el=document.getElementById('measureReadout');if(el){el.textContent=this.measureMode?'Click a surface to start measuring…':'';el.classList.toggle('is-visible',this.measureMode);}if(!this.measureMode)this.a=null;}
 resize(){const el=document.getElementById('view3d-container');if(!el)return;const r=el.getBoundingClientRect();if(r.width<10)return;this.renderer.setSize(r.width,r.height,false);this.camera.aspect=r.width/r.height;this.camera.updateProjectionMatrix()}
 clear(){while(this.group.children.length)this.group.remove(this.group.children[0]);this.roomData=[]}
 generate(){this.clear();const px=this.s.pxPerFoot,H=this.s.wallHeight,th=.5,mat=new THREE.MeshStandardMaterial({color:new THREE.Color(this.s.wallColor),side:THREE.DoubleSide,roughness:.9});for(const room of this.s.rooms){const pts=room.points.map(p=>({x:p.x/px,z:p.y/px}));const shape=pts.map(p=>new THREE.Vector2(p.x,p.z));let tris=[];try{tris=THREE.ShapeUtils.triangulateShape(shape,[])}catch{}if(tris.length){const pos=new Float32Array(pts.length*3);pts.forEach((p,i)=>{pos[i*3]=p.x;pos[i*3+2]=p.z});const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setIndex(tris.flatMap(t=>[t[0],t[1],t[2]]));geo.computeVertexNormals();this.group.add(new THREE.Mesh(geo,new THREE.MeshStandardMaterial({color:FLOOR[room.floor]||FLOOR.tile,side:THREE.DoubleSide,roughness:.82})))}const os=this.s.openings.filter(o=>o.roomId===room.id);for(let i=0;i<pts.length;i++)this.wall(pts[i],pts[(i+1)%pts.length],H,th,os.filter(o=>o.edgeIndex===i),mat);this.ceiling(pts,H);const cen=Geometry.centroid(room.points),b=Geometry.bounds(room.points,px);this.roomData.push({name:room.name,pos:new THREE.Vector3(cen.x/px,0,cen.y/px),info:`${Units.feetInches(b.w)} × ${Units.feetInches(b.h)} · ${Units.area(Geometry.area(room.points,px))}`})}if(this.s.rooms.length){const c=Geometry.centroid(this.s.rooms[0].points);this.camera.position.set(c.x/px,5.5,c.y/px)}this.sunUpdate()}
 ceiling(pts,H){if(pts.length<3)return;const shape=pts.map(p=>new THREE.Vector2(p.x,p.z));let tris=[];try{tris=THREE.ShapeUtils.triangulateShape(shape,[])}catch{}if(!tris.length)return;const pos=new Float32Array(pts.length*3);pts.forEach((p,i)=>{pos[i*3]=p.x;pos[i*3+1]=H-.035;pos[i*3+2]=p.z});const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(pos,3));geo.setIndex(tris.flatMap(t=>[t[0],t[2],t[1]]));geo.computeVertexNormals();const m=new THREE.Mesh(new THREE.MeshStandardMaterial({color:0xf4f3ee,roughness:.92,side:THREE.DoubleSide}));m.userData.type='ceiling';m.geometry=geo;this.group.add(m)}
 wall(a,b,H,th,openings,mat){const dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);if(len<.05)return;const g=new THREE.Group();g.position.set((a.x+b.x)/2,0,(a.z+b.z)/2);g.rotation.y=Math.atan2(-dz,dx);this.group.add(g);const iv=openings.map(o=>({start:Math.max(0,o.t*len-o.width/2),end:Math.min(len,o.t*len+o.width/2),type:o.type})).sort((a,b)=>a.start-b.start);let cur=0;const add=(st,en,y,h)=>{if(en-st<=.02)return;const m=new THREE.Mesh(new THREE.BoxGeometry(en-st,h,th),mat);m.position.set(st-len/2+(en-st)/2,y,0);g.add(m)};for(const o of iv){add(cur,o.start,H/2,H);cur=Math.max(cur,o.end)}add(cur,len,H/2,H);for(const o of iv){if(o.type==='door'){if(H>6.8)add(o.start,o.end,6.8+(H-6.8)/2,H-6.8)}else{add(o.start,o.end,1.5,3);if(H>6.6)add(o.start,o.end,6.6+(H-6.6)/2,H-6.6);const glass=new THREE.Mesh(new THREE.BoxGeometry(o.end-o.start,3.6,.06),new THREE.MeshStandardMaterial({color:0xa7cbd4,transparent:true,opacity:.42}));glass.position.set(o.start-len/2+(o.end-o.start)/2,4.8,0);g.add(glass)}}}
 sunUpdate(){const t=12,frac=(t-6)/12,e=Math.max(.08,Math.sin(Math.PI*frac));this.sun.position.set(0,80*e+10,80);this.sun.intensity=.6+e*.8}
 measure(e){const r=this.renderer.domElement.getBoundingClientRect(),m=new THREE.Vector2(0,0),ray=new THREE.Raycaster();ray.setFromCamera(m,this.camera);const hit=ray.intersectObjects(this.group.children,true)[0];if(!hit)return;if(!this.a){this.a=hit.point;const el=document.getElementById('measureReadout');if(el){el.textContent='Click second surface…';el.classList.add('is-visible');}return}const b=hit.point;const el=document.getElementById('measureReadout');if(el)el.textContent=Units.length(this.a.distanceTo(b));if(this.line)this.group.remove(this.line);this.line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([this.a,b]),new THREE.LineBasicMaterial({color:0x111111}));this.group.add(this.line);this.a=null}
 toggleCeilings(){this.group.traverse(o=>{if(o.userData.type==='ceiling')o.visible=!o.visible})}
 _updateRoomHUD(){
  // Find nearest room and show its info in the corner HUD (not floating in 3D space)
  const pos=this.camera.position;let nearest=null,minD=Infinity;
  for(const rd of this.roomData){const d=new THREE.Vector3(rd.pos.x,0,rd.pos.z).distanceTo(new THREE.Vector3(pos.x,0,pos.z));if(d<minD){minD=d;nearest=rd;}}
  const hud=document.getElementById('roomHUD');
  if(hud&&nearest&&minD<30){hud.innerHTML=`<strong>${nearest.name}</strong><span>${nearest.info}</span>`;hud.style.opacity='1';}
  else if(hud)hud.style.opacity='0';
 }
 animate(){requestAnimationFrame(()=>this.animate());
  if(this.locked){
   const dir=new THREE.Vector3();this.camera.getWorldDirection(dir);dir.y=0;dir.normalize();
   const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0));
   if(this.keys.w)this.camera.position.addScaledVector(dir,this.speed);
   if(this.keys.s)this.camera.position.addScaledVector(dir,-this.speed);
   if(this.keys.a)this.camera.position.addScaledVector(right,-this.speed);
   if(this.keys.d)this.camera.position.addScaledVector(right,this.speed);
   if(this.keys.q||this.keys.arrowleft){this.yaw+=0.03;this.camera.rotation.set(this.pitch,this.yaw,0);}
   if(this.keys.e||this.keys.arrowright){this.yaw-=0.03;this.camera.rotation.set(this.pitch,this.yaw,0);}
  }
  this._updateRoomHUD();
  this.renderer.render(this.scene,this.camera)
 }
}
