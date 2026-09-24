import {Geometry} from '../core/Geometry.js';
import {Units} from '../core/Units.js';
import {ImagePlanDetector} from './ImagePlanDetector.js';

export class PlanEditor{
  constructor(state,modal,onChange){this.state=state;this.modal=modal;this.onChange=onChange;this.canvas=null;this.ctx=null;this.mouse=null;this.detector=new ImagePlanDetector(this)}
  init(){this.canvas=document.getElementById('planCanvas');this.ctx=this.canvas.getContext('2d');addEventListener('resize',()=>this.resize());this.canvas.onclick=e=>this.click(e);this.canvas.ondblclick=()=>this.finishRoom();this.canvas.onmousemove=e=>{this.mouse=this.pos(e);this.draw()};addEventListener('keydown',e=>{if(e.key==='Escape'){this.state.currentRoomPoints=[];this.draw()}if(e.key==='Enter')this.finishRoom()});this.resize()}
  resize(){const r=this.canvas.parentElement.getBoundingClientRect();this.canvas.width=r.width;this.canvas.height=r.height;this.draw()}
  pos(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  click(e){const p=this.pos(e),s=this.state;if(s.tool==='autoRoom'){this.autoDetectRoom(p);return;}if(s.tool==='room')s.currentRoomPoints.push(p);else if(s.tool==='calibrate'){s.calibPoints.push(p);if(s.calibPoints.length===2)this.calibrate()}else if(s.tool==='door'||s.tool==='window')this.placeOpening(p,s.tool);this.draw();this.onChange()}

  imagePoint(p){
    if(!this.state.planImage)return null;
    const img=this.state.planImage, scaleX=(img.naturalWidth||img.width)/img.width, scaleY=(img.naturalHeight||img.height)/img.height;
    return {x:(p.x-24)*scaleX,y:(p.y-24)*scaleY};
  }
  canvasPoint(p){
    const img=this.state.planImage, scaleX=img.width/(img.naturalWidth||img.width), scaleY=img.height/(img.naturalHeight||img.height);
    return {x:p.x*scaleX+24,y:p.y*scaleY+24};
  }
  autoDetectRoom(p){
    const detected=this.detector.detectRoom(p);
    if(!detected){this.modal.ask('Could not detect a room','Click near the centre of a clearly outlined room and try again.');return;}
    const id=this.state.nextRoomId++;
    const name=`Room ${id}`;
    this.state.rooms.push({id,name,points:detected.points,floor:this.state.defaultFloor});
    this.addDetectedOpenings(id,detected);
    this.state.tool='select';this.onChange();this.draw();
  }
  addDetectedOpenings(roomId,detected){
    const pts=detected.points;
    for(const o of detected.openings){
      let t;
      if(o.edge===0||o.edge===2){const left=o.edge===0?pts[0]:pts[3],right=o.edge===0?pts[1]:pts[2];const a=this.imagePoint(left),b=this.imagePoint(right);t=(o.center-a.x)/(b.x-a.x);}
      else{const top=o.edge===1?pts[1]:pts[0],bottom=o.edge===1?pts[2]:pts[3];const a=this.imagePoint(top),b=this.imagePoint(bottom);t=(o.center-a.y)/(b.y-a.y);}
      if(Number.isFinite(t)&&t>0.03&&t<.97)this.state.openings.push({roomId,edgeIndex:o.edge,t:Math.max(0,Math.min(1,t)),type:o.type,width:o.type==='door'?3:4});
    }
  }

  placeOpening(p,type){let best=null;for(const room of this.state.rooms){for(let i=0;i<room.points.length;i++){const a=room.points[i],b=room.points[(i+1)%room.points.length],np=Geometry.nearestEdgePoint(p,a,b),d=Geometry.dist(p,np);if(d<18&&(!best||d<best.d))best={d,roomId:room.id,edgeIndex:i,t:np.t}}}if(best)this.state.openings.push({roomId:best.roomId,edgeIndex:best.edgeIndex,t:best.t,type,width:type==='door'?3:4})}
  async calibrate(){const [a,b]=this.state.calibPoints,pxLen=Geometry.dist(a,b);this.state.calibPoints=[];this.state.tool='select';this.onChange();const val=await this.modal.ask('Real-world length of that line','10\'0"');const ft=Units.parse(val);if(ft>0){this.state.pxPerFoot=pxLen/ft;this.state.calibrated=true;this.onChange()}this.draw()}
  async finishRoom(){const s=this.state;if(s.tool!=='room'||s.currentRoomPoints.length<3)return;const id=s.nextRoomId++,name=await this.modal.ask('Name this room',`Room ${id}`);s.rooms.push({id,name:name||`Room ${id}`,points:s.currentRoomPoints.slice(),floor:s.defaultFloor});s.currentRoomPoints=[];this.onChange();this.draw()}
  undo(){const s=this.state;if(s.currentRoomPoints.length)s.currentRoomPoints.pop();else if(s.openings.length)s.openings.pop();else if(s.rooms.length)s.rooms.pop();this.onChange();this.draw()}
  draw(){const s=this.state,c=this.canvas,x=this.ctx;if(!x)return;x.clearRect(0,0,c.width,c.height);x.fillStyle='#f5f5f3';x.fillRect(0,0,c.width,c.height);const step=Math.max(8,s.pxPerFoot);x.strokeStyle='rgba(0,0,0,.055)';x.lineWidth=1;for(let i=0;i<c.width;i+=step){x.beginPath();x.moveTo(i,0);x.lineTo(i,c.height);x.stroke()}for(let i=0;i<c.height;i+=step){x.beginPath();x.moveTo(0,i);x.lineTo(c.width,i);x.stroke()}if(s.planImage){x.globalAlpha=.46;x.drawImage(s.planImage,24,24,s.planImage.width,s.planImage.height);x.globalAlpha=1}s.rooms.forEach(r=>this.drawRoom(r));s.openings.forEach(o=>this.drawOpening(o));if(s.currentRoomPoints.length){x.strokeStyle='#111';x.lineWidth=2;x.beginPath();s.currentRoomPoints.forEach((p,i)=>i?x.lineTo(p.x,p.y):x.moveTo(p.x,p.y));if(this.mouse)x.lineTo(this.mouse.x,this.mouse.y);x.stroke();s.currentRoomPoints.forEach(p=>{x.fillStyle='#111';x.beginPath();x.arc(p.x,p.y,4,0,7);x.fill()})}if(s.calibPoints.length===1&&this.mouse){x.strokeStyle='#111';x.setLineDash([5,5]);x.beginPath();x.moveTo(s.calibPoints[0].x,s.calibPoints[0].y);x.lineTo(this.mouse.x,this.mouse.y);x.stroke();x.setLineDash([])}}
  drawRoom(room){const x=this.ctx,p=room.points;x.beginPath();p.forEach((q,i)=>i?x.lineTo(q.x,q.y):x.moveTo(q.x,q.y));x.closePath();x.fillStyle='rgba(0,0,0,.035)';x.fill();x.strokeStyle='#171717';x.lineWidth=2;x.stroke();const cen=Geometry.centroid(p),b=Geometry.bounds(p,this.state.pxPerFoot),a=Geometry.area(p,this.state.pxPerFoot);x.textAlign='center';x.fillStyle='#111';x.font='600 12px Inter';x.fillText(room.name,cen.x,cen.y-12);x.fillStyle='#6f6f69';x.font='11px "IBM Plex Mono"';x.fillText(`${Units.feetInches(b.w)} × ${Units.feetInches(b.h)}`,cen.x,cen.y+5);x.fillText(Units.area(a),cen.x,cen.y+20);x.textAlign='left';for(let i=0;i<p.length;i++){const q=p[i],r=p[(i+1)%p.length],len=Geometry.dist(q,r)/this.state.pxPerFoot;x.fillStyle='#8a8a84';x.font='10px "IBM Plex Mono"';x.fillText(Units.feetInches(len),(q.x+r.x)/2+4,(q.y+r.y)/2-4)}}
  drawOpening(o){const room=this.state.rooms.find(r=>r.id===o.roomId);if(!room)return;const a=room.points[o.edgeIndex],b=room.points[(o.edgeIndex+1)%room.points.length],cx=a.x+(b.x-a.x)*o.t,cy=a.y+(b.y-a.y)*o.t;const x=this.ctx;x.fillStyle=o.type==='door'?'#111':'#777';x.beginPath();x.arc(cx,cy,5,0,7);x.fill()}
  loadImage(file){const reader=new FileReader();reader.onload=e=>{const img=new Image();img.onload=()=>{this.state.planImage=img;this.state.planImageData=e.target.result;this.draw();this.onChange()};img.src=e.target.result};reader.readAsDataURL(file)}
}
