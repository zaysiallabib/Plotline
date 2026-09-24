import {Geometry} from '../core/Geometry.js';

// Lightweight V1.2 floor-plan detection. It intentionally stays heuristic:
// the browser looks for strong wall lines around a clicked room and estimates openings from gaps.
export class ImagePlanDetector {
  constructor(editor){this.editor=editor}

  detectRoom(point){
    const image=this.editor.state.planImage;
    if(!image)return null;
    const c=document.createElement('canvas');
    c.width=image.naturalWidth||image.width;c.height=image.naturalHeight||image.height;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);
    const source=this.editor.imagePoint(point);
    if(!source)return null;
    const data=ctx.getImageData(0,0,c.width,c.height);
    const dark=(x,y)=>{
      if(x<0||y<0||x>=c.width||y>=c.height)return true;
      const i=(y*c.width+x)*4;
      return (data[i]*.299+data[i+1]*.587+data[i+2]*.114)<145;
    };
    const wallAt=(x,y,axis)=>{
      let hits=0;
      for(let n=-2;n<=2;n++){
        const xx=axis==='x'?x:x+n, yy=axis==='y'?y:y+n;
        if(dark(Math.round(xx),Math.round(yy)))hits++;
      }
      return hits>=3;
    };
    const find=(dx,dy)=>{
      const max=2600,step=2;let run=0;
      for(let d=step;d<max;d+=step){
        const x=source.x+dx*d,y=source.y+dy*d;
        if(wallAt(x,y,dx?'x':'y')){run+=1;if(run>=2)return{x:Math.round(x),y:Math.round(y)};}
        else run=0;
        if(x<0||y<0||x>=c.width||y>=c.height)break;
      }
      return null;
    };
    const left=find(-1,0),right=find(1,0),top=find(0,-1),bottom=find(0,1);
    if(!left||!right||!top||!bottom)return null;
    const p=[
      this.editor.canvasPoint(left),this.editor.canvasPoint(right),
      this.editor.canvasPoint({x:right.x,y:bottom.y}),this.editor.canvasPoint({x:left.x,y:bottom.y})
    ];
    if(Geometry.dist(p[0],p[1])<30||Geometry.dist(p[0],p[3])<30)return null;
    return {points:p,openings:this.detectOpenings(data,c,{left,right,top,bottom})};
  }

  detectOpenings(data,c,bounds){
    const result=[];
    const dark=(x,y)=>{
      if(x<0||y<0||x>=c.width||y>=c.height)return true;
      const i=(y*c.width+x)*4;
      return (data[i]*.299+data[i+1]*.587+data[i+2]*.114)<145;
    };
    const scan=(axis,fixed,start,end)=>{
      const gaps=[];let gapStart=null;
      for(let v=start;v<=end;v+=2){
        let wall=false;
        for(let n=-2;n<=2;n++){
          const x=axis==='x'?v:fixed+n,y=axis==='x'?fixed+n:v;
          if(dark(Math.round(x),Math.round(y)))wall=true;
        }
        if(!wall&&gapStart===null)gapStart=v;
        if((wall||v===end)&&gapStart!==null){
          const gapEnd=wall?v-2:v;
          if(gapEnd-gapStart>=12&&gapEnd-gapStart<=220)gaps.push([gapStart,gapEnd]);
          gapStart=null;
        }
      }
      return gaps;
    };
    const add=(edge,g)=>{
      const center=(g[0]+g[1])/2;
      const span=g[1]-g[0];
      // Approximate classification: narrower gaps are doors, wider gaps are windows.
      const type=span<=85?'door':'window';
      result.push({edge,center,span,type});
    };
    scan('x',bounds.top.y,bounds.left.x,bounds.right.x).forEach(g=>add(0,g));
    scan('x',bounds.bottom.y,bounds.left.x,bounds.right.x).forEach(g=>add(2,g));
    scan('y',bounds.left.x,bounds.top.y,bounds.bottom.y).forEach(g=>add(3,g));
    scan('y',bounds.right.x,bounds.top.y,bounds.bottom.y).forEach(g=>add(1,g));
    return result;
  }
}
