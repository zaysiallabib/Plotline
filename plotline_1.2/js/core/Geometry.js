export const Geometry={
  dist(a,b){return Math.hypot(b.x-a.x,b.y-a.y)},
  nearestEdgePoint(p,a,b){const x=b.x-a.x,y=b.y-a.y,l=x*x+y*y||1;let t=((p.x-a.x)*x+(p.y-a.y)*y)/l;t=Math.max(0,Math.min(1,t));return{x:a.x+x*t,y:a.y+y*t,t}},
  area(points,px){let a=0;for(let i=0;i<points.length;i++){const p=points[i],q=points[(i+1)%points.length];a+=p.x*q.y-q.x*p.y}return Math.abs(a)/2/(px*px)},
  bounds(points,px){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{w:(Math.max(...xs)-Math.min(...xs))/px,h:(Math.max(...ys)-Math.min(...ys))/px}},
  centroid(points){return points.reduce((c,p)=>({x:c.x+p.x/points.length,y:c.y+p.y/points.length}),{x:0,y:0})}
};
