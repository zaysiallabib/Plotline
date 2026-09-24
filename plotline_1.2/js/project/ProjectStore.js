export class ProjectStore{
  constructor(){this.backend=window.storage||null}
  async get(key){if(this.backend)return this.backend.get(key,false);const v=localStorage.getItem(key);if(v===null)throw Error('not found');return{key,value:v}}
  async set(key,value){if(this.backend)return this.backend.set(key,value,false);localStorage.setItem(key,value);return{key,value}}
  async del(key){if(this.backend)return this.backend.delete(key,false);localStorage.removeItem(key)}
  async list(prefix='projects:'){if(this.backend){const r=await this.backend.list(prefix,false);return r?.keys||[]}const out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k?.startsWith(prefix))out.push(k)}return out}
  async save(name,data){return !!(await this.set(`projects:${name}`,JSON.stringify(data)))}
  async load(key){try{const r=await this.get(key);return JSON.parse(r.value)}catch{return null}}
  async shareSave(code,data){try{if(this.backend)return !!(await this.backend.set(`shared:${code}`,JSON.stringify(data),true));localStorage.setItem(`shared:${code}`,JSON.stringify(data));return true}catch{return false}}
  async shareLoad(code){try{if(this.backend){const r=await this.backend.get(`shared:${code}`,true);return r?JSON.parse(r.value):null}const v=localStorage.getItem(`shared:${code}`);return v?JSON.parse(v):null}catch{return null}}
}
