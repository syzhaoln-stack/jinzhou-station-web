import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createLoadingProgress,formatLoadingProgress} from './loading-progress.js';

export function disposeTree(root){
  if(!root)return;root.removeFromParent();const gs=new Set(),ms=new Set(),ts=new Set();
  root.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])ms.add(m);});
  for(const m of ms){for(const v of Object.values(m))if(v?.isTexture)ts.add(v);m.dispose();}
  for(const g of gs)g.dispose();for(const t of ts){t.dispose();t.source?.data?.close?.();}
}
export class SceneEngine{
  constructor(host,onStatus){
    this.host=host;this.onStatus=onStatus;this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#c5d0d5');
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.NoToneMapping;this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
    this.renderer.domElement.setAttribute('aria-label','真实三维场站，可拖动旋转、滚轮缩放、点击建筑');this.renderer.domElement.tabIndex=0;host.prepend(this.renderer.domElement);
    this.camera=new THREE.PerspectiveCamera(39,1,.15,20000);this.controls=new OrbitControls(this.camera,this.renderer.domElement);Object.assign(this.controls,{enableDamping:false,autoRotate:false,minDistance:2,maxDistance:12000,maxPolarAngle:Math.PI/2-.02,screenSpacePanning:false});
    this.loader=new GLTFLoader();this.view='overview';this.repaired=true;this.cleanupEnabled=true;this.motion=null;this.recordingSize=null;
    this.scene.userData.hasAppLighting=true;this.scene.add(new THREE.HemisphereLight(0xdcecff,0x8c8172,1.05));const key=new THREE.DirectionalLight(0xfff1d5,2);key.position.set(100,400,150);key.target.position.set(350,35,-220);this.scene.add(key,key.target);
    this.controls.addEventListener('start',()=>{this.motion=null;this.onManual?.();});
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(host);this.resize();
  }
  resize(){const w=this.recordingSize?.[0]||this.host.clientWidth,h=this.recordingSize?.[1]||this.host.clientHeight;this.renderer.setPixelRatio(this.recordingSize?1:Math.min(devicePixelRatio,1.6));this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  setRecordingSize(size){this.recordingSize=size;this.resize();}
  staticMaterials(root){const cache=new Map();root.traverse(o=>{if(!o.isMesh)return;const mats=Array.isArray(o.material)?o.material:[o.material];const mapped=mats.map(m=>{if(!cache.has(m)){const x=new THREE.MeshBasicMaterial({map:m.map||null,color:m.color,side:THREE.DoubleSide,vertexColors:!!o.geometry.attributes.color,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest});if(x.map)x.map.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());cache.set(m,x);m.dispose();}return cache.get(m);});o.material=Array.isArray(o.material)?mapped:mapped[0];});}
  async load(config,view='overview',repaired=true,{preserve=false}={}){
    this.onBeforeLoad?.();this.motion=null;const previous=[this.camera.position.toArray(),this.controls.target.toArray()];if(this.retiredTiles&&this.ground)this.ground.add(this.retiredTiles);disposeTree(this.ground);disposeTree(this.repair);this.ground=this.repair=this.retiredTiles=null;this.renderer.renderLists.dispose();this.view=view;this.repaired=repaired;
    const asset=config.models[view],source=repaired&&asset.clipped?asset.clipped:asset.original;
    const enabled=layer=>layer.kind!=='vehicle-cleanup'||this.cleanupEnabled;
    const replacements=repaired?(asset.replacementTiles||[]).filter(enabled):[],patches=repaired?(asset.groundPatches||[]).filter(enabled):[],repairs=repaired&&asset.clipped?(asset.repairModels||[config.repair?.model].filter(Boolean)):[];
    const progress=createLoadingProgress(1+replacements.length+patches.length+repairs.length);
    const report=state=>{this.host.dataset.loadingProgress=String(state.percent);this.host.dataset.loadingPhase=state.phase;this.onStatus('loading',formatLoadingProgress(state));};
    const loadAsset=async(path,label)=>{report(progress.startAsset(label));const model=await this.loader.loadAsync(path,p=>report(progress.transfer(p)));report(progress.assetReady());return model;};
    const result=await loadAsset(source,(view==='overview'?'全景':'主库精细')+'模型');
    this.ground=result.scene;this.staticMaterials(this.ground);this.scene.add(this.ground);this.box=new THREE.Box3().setFromObject(this.ground);
    // Replace only audited source tiles by their original GLTF names. Retain
    // detached resources until the whole base is disposed (textures may be shared).
    const applied=[];this.retiredTiles=new THREE.Group();
    for(const layer of replacements){
      const replacement=(await loadAsset(layer.model,'场区细节')).scene;
      const exact=o=>o.userData.name||o.name,old=new Map(),fresh=new Map();
      this.ground.traverse(o=>{if(o.isMesh){const n=exact(o);if(old.has(n))old.set(n,null);else old.set(n,o);}});
      replacement.traverse(o=>{if(o.isMesh){const n=exact(o);if(fresh.has(n))throw new Error('替换模型节点重名：'+n);fresh.set(n,o);}});
      const names=layer.names||[...fresh.keys()],removals=new Set(layer.removeNames||[]);
      if([...removals].some(n=>!names.includes(n))||fresh.size!==names.length-removals.size||names.some(n=>!old.get(n)||(removals.has(n)?fresh.has(n):!fresh.has(n)))){disposeTree(replacement);throw new Error('局部替换节点与原模型不一致：'+layer.model);}
      for(const name of names)this.retiredTiles.attach(old.get(name));
      this.staticMaterials(replacement);this.ground.add(replacement);applied.push(...names);
    }
    for(const layer of patches){const patch=(await loadAsset(typeof layer==='string'?layer:layer.model,'场区地面')).scene;this.staticMaterials(patch);this.ground.add(patch);}
    if(repaired&&asset.clipped){this.repair=new THREE.Group();this.repair.name='Station_Local_Reconstructions';for(const path of repairs)this.repair.add((await loadAsset(path,'建筑与设备')).scene);this.scene.add(this.repair);}
    report(progress.prepareScene());
    let meshes=0,triangles=0;this.ground.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}});
    this.host.dataset.sourceModel=source;this.host.dataset.meshes=meshes;this.host.dataset.triangles=Math.round(triangles);this.host.dataset.repairActive=!!this.repair;this.host.dataset.replacementTiles=JSON.stringify(applied);this.host.dataset.groundPatches=JSON.stringify(repaired?asset.groundPatches||[]:[]);
    if(preserve)this.setCamera(previous,true);else this.home(true);
    this.renderer.render(this.scene,this.camera);report(progress.sceneReady());
    this.onStatus('ready',(view==='overview'?'全景':'原始精细模型')+(this.repair?' · Blender 局部修复已启用':' · 原始外观'));return this.ground;
  }
  home(immediate=false){const c=this.box.getCenter(new THREE.Vector3()),size=this.box.getSize(new THREE.Vector3());const r=size.length()*.52;const p=this.view==='overview'?[[1150,1250,1100],[35,35,-24]]:[[610,250,60],[450,42,-210]];this.setCamera(p,immediate);}
  top(){const c=this.box.getCenter(new THREE.Vector3());const r=this.box.getSize(new THREE.Vector3()).length();this.setCamera([[c.x,c.y+r*1.15,c.z+.01],c.toArray()]);}
  setCamera(preset,immediate=false){if(!preset?.[0]||!preset?.[1])return;this.controls.autoRotate=false;if(immediate){this.camera.position.fromArray(preset[0]);this.controls.target.fromArray(preset[1]);this.motion=null;this.controls.update();return;}this.motion={start:performance.now(),from:this.camera.position.clone(),to:new THREE.Vector3(...preset[0]),targetFrom:this.controls.target.clone(),targetTo:new THREE.Vector3(...preset[1])};}
  zoom(f){this.motion=null;const delta=this.camera.position.clone().sub(this.controls.target);delta.setLength(THREE.MathUtils.clamp(delta.length()*f,2,12000));this.camera.position.copy(this.controls.target).add(delta);this.controls.update();}
  focus(point,distance=115){const t=new THREE.Vector3(...point);this.setCamera([t.clone().add(new THREE.Vector3(.75,.7,1).normalize().multiplyScalar(distance)).toArray(),point]);}
  hit(clientX,clientY){if(!this.ground)return null;const r=this.renderer.domElement.getBoundingClientRect();const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1),this.camera);return ray.intersectObject(this.ground,true)[0]||null;}
  render(dt,now){if(this.motion){const m=this.motion,u=Math.min((now-m.start)/1200,1),q=u*u*(3-2*u);this.camera.position.lerpVectors(m.from,m.to,q);this.controls.target.lerpVectors(m.targetFrom,m.targetTo,q);if(u===1)this.motion=null;}this.controls.update(dt);this.renderer.render(this.scene,this.camera);}
}
