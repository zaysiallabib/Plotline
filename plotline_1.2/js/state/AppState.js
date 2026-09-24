export class AppState {
  constructor(){ this.reset(); }
  reset(){
    this.project={name:'Untitled Project',client:'',address:'',description:'',type:'House',status:'Draft',version:1};
    this.rooms=[]; this.openings=[]; this.planImage=null; this.planImageData=null;
    this.pxPerFoot=20; this.calibrated=false; this.wallColor='#EDE7D8'; this.wallHeight=9; this.defaultFloor='tile';
    this.tool='select'; this.currentRoomPoints=[]; this.calibPoints=[]; this.nextRoomId=1; this.mode='plan'; this.viewOnly=false;
  }
  totalAreaFt(){return this.rooms.reduce((sum,r)=>sum+polygonAreaFt(r.points,this.pxPerFoot),0);}
}
function polygonAreaFt(points,px){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p.x*q.y-q.x*p.y;}return Math.abs(a)/2/(px*px)}
