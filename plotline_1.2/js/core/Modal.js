export class Modal{
  constructor(){this.root=document.getElementById('modalBg');this.input=document.getElementById('modalInput');this.label=document.getElementById('modalLabel');this.resolve=null;document.getElementById('modalOk').onclick=()=>this.finish(this.input.value);document.getElementById('modalCancel').onclick=()=>this.finish(null);this.input.onkeydown=e=>{if(e.key==='Enter')this.finish(this.input.value);if(e.key==='Escape')this.finish(null)}}
  ask(label,def=''){return new Promise(resolve=>{this.resolve=resolve;this.label.textContent=label;this.input.value=def;this.root.classList.add('is-open');this.root.setAttribute('aria-hidden','false');setTimeout(()=>this.input.focus(),20)})}
  finish(value){this.root.classList.remove('is-open');this.root.setAttribute('aria-hidden','true');const r=this.resolve;this.resolve=null;if(r)r(value)}
}
