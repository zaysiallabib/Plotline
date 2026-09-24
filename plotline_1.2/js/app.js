import {AppState} from './state/AppState.js';
import {ProjectStore} from './project/ProjectStore.js';
import {ProjectSerializer} from './project/ProjectSerializer.js';
import {Modal} from './core/Modal.js';
import {PlanEditor} from './editor/PlanEditor.js';
import {ThreeRenderer} from './renderer/ThreeRenderer.js';
import {UIController} from './ui/UIController.js';

class PlotlineApp{
 constructor(){this.state=new AppState();this.store=new ProjectStore();this.modal=new Modal();this.ui=new UIController(this);this.plan=null;this.renderer=null}
 async start(){this.showDashboard()}
 showDashboard(){this.state.viewOnly=false;this.ui.renderDashboard()}
 createProject(fields){this.state.reset();this.state.project={...this.state.project,...fields,name:fields.name||'Untitled Project',client:fields.client||'',status:'Draft',version:1};this.openWorkspace()}
 openProject(data){this.state.reset();data=this.migrate(data);ProjectSerializer.toState(data,this.state);this.openWorkspace()}
 migrate(data){if(data?.project)return data;return {project:{name:data?.name||'Untitled Project',client:data?.client||'',status:'Draft',version:1},rooms:data?.rooms||[],openings:data?.openings||[],pxPerFoot:data?.pxPerFoot||20,calibrated:data?.calibrated||false,wallColor:data?.wallColor||'#EDE7D8',wallHeight:data?.wallHeight||9,defaultFloor:data?.defaultFloor||'tile',planImageData:data?.planImageData||null}}
 openWorkspace(){this.ui.renderWorkspace();this.plan=new PlanEditor(this.state,this.modal,()=>this.syncUI());this.plan.init();this.renderer=new ThreeRenderer(this.state);this.renderer.init();this.restoreImage();this.syncUI()}
 restoreImage(){if(!this.state.planImageData)return;const img=new Image();img.onload=()=>{this.state.planImage=img;this.plan.draw();this.syncUI()};img.src=this.state.planImageData}
 syncUI(){const s=this.state;document.getElementById('projectTitle')?.replaceChildren(document.createTextNode(s.project.name));const st=document.getElementById('scaleStatus');if(st)st.textContent=s.calibrated?'Calibrated':'Not calibrated';const hint=document.getElementById('emptyHint');if(hint)hint.style.display=s.planImage||s.rooms.length?'none':'flex';this.ui.refreshTools()}
 setTool(tool){this.state.tool=tool;this.state.currentRoomPoints=[];this.state.calibPoints=[];this.syncUI();this.plan.draw()}
 setMode(mode){this.state.mode=mode;document.getElementById('planCanvas').style.display=mode==='plan'?'block':'none';document.getElementById('view3d-container').style.display=mode==='3d'?'block':'none';document.getElementById('planMode').classList.toggle('is-active',mode==='plan');document.getElementById('walkMode').classList.toggle('is-active',mode==='3d');if(mode==='3d'){this.renderer.resize();if(this.state.rooms.length)this.renderer.generate()}}
 generate(){if(!this.state.rooms.length){this.modal.ask('Draw at least one room first');return}this.renderer.generate();this.setMode('3d')}
 render3DIfActive(){if(this.state.mode==='3d'&&this.state.rooms.length)this.renderer.generate()}
 async saveProject(){const name=await this.modal.ask('Save project as',this.state.project.name);if(!name)return;this.state.project.name=name;this.state.project.version=this.state.project.version||1;await this.store.save(name,ProjectSerializer.fromState(this.state));this.modal.ask('Saved',name)}
 async shareProject(){const code=Math.random().toString(36).slice(2,8).toUpperCase();const ok=await this.store.shareSave(code,ProjectSerializer.fromState(this.state));if(ok)await this.modal.ask('Share code',code)}
}
new PlotlineApp().start();
