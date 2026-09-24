export class ProjectSerializer{
  static fromState(state){return {project:state.project,rooms:state.rooms,openings:state.openings,pxPerFoot:state.pxPerFoot,calibrated:state.calibrated,wallColor:state.wallColor,wallHeight:state.wallHeight,defaultFloor:state.defaultFloor,planImageData:state.planImageData}}
  static toState(data,state){if(!data)return;Object.assign(state.project,{...data.project});state.rooms=data.rooms||[];state.openings=data.openings||[];state.pxPerFoot=data.pxPerFoot||20;state.calibrated=!!data.calibrated;state.wallColor=data.wallColor||'#EDE7D8';state.wallHeight=data.wallHeight||9;state.defaultFloor=data.defaultFloor||'tile';state.planImageData=data.planImageData||null;state.nextRoomId=state.rooms.reduce((m,r)=>Math.max(m,r.id||0),0)+1}
}
