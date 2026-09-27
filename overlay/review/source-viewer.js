import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createLoadingProgress,formatLoadingProgress} from './loading-progress.js';

const host=document.getElementById('view'), state=document.getElementById('state');
const renderer=new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(devicePixelRatio,2));
renderer.setSize(host.clientWidth,host.clientHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;
renderer.domElement.setAttribute('aria-label','三维场站：拖动旋转，滚轮缩放，双击定位');
renderer.domElement.tabIndex=0;
host.prepend(renderer.domElement);
const scene=new THREE.Scene(); scene.background=new THREE.Color('#c5d0d5');
const camera=new THREE.PerspectiveCamera(39,host.clientWidth/host.clientHeight,.15,20000);
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=false; controls.autoRotate=false; controls.autoRotateSpeed=.35;
controls.minDistance=2; controls.maxPolarAngle=Math.PI/2-.02; controls.screenSpacePanning=false;
let model,move,rotating=false,metadata,activeAsset,loadCount=0;
let motion=null, motionPending=false;
const views={};
const loader=new GLTFLoader();
const allButtons=()=>document.querySelectorAll('button');
const selector=document.getElementById('model-choice');

function stop(){
  move=null; rotating=false; controls.autoRotate=false;
  document.getElementById('rotate').textContent='开始慢速旋转';
  state.textContent='画面已定格';
}
function transition(position,target){
  stop(); move={start:performance.now(),from:camera.position.clone(),to:new THREE.Vector3(...position),targetFrom:controls.target.clone(),targetTo:new THREE.Vector3(...target)};
  state.textContent='平稳切换视角…';
}
function release(){
  if(motion){motion.dispose();motion=null;}
  delete host.dataset.motion;
  document.getElementById('motion-play').textContent='播放人车预演';
  const motionState=document.getElementById('motion-state');if(motionState)motionState.textContent='在真实前广场内查看人物与车辆运动。';
  if(!model)return;
  scene.remove(model);
  const materials=new Set(), textures=new Set(), geometries=new Set();
  model.traverse(n=>{if(n.isMesh){geometries.add(n.geometry);for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);}});
  for(const m of materials){for(const v of Object.values(m))if(v?.isTexture)textures.add(v);m.dispose();}
  for(const t of textures){t.dispose();if(typeof t.source?.data?.close==='function')t.source.data.close();}
  for(const g of geometries)g.dispose();
  model=null; renderer.renderLists.dispose();
}
async function activate(asset){
  const ticket=++loadCount; activeAsset=asset;
  if(asset.id)selector.value=asset.id;
  stop(); release(); allButtons().forEach(b=>b.disabled=true); selector.disabled=true;
  const loading=document.getElementById('loading'); loading.style.display='grid';
  const progress=createLoadingProgress(),report=value=>{if(ticket!==loadCount)return;loading.textContent=formatLoadingProgress(value);host.dataset.loadingProgress=String(value.percent);host.dataset.loadingPhase=value.phase;};
  report(progress.startAsset('原始三维模型'));
  try{
    const gltf=await loader.loadAsync(asset.model,x=>report(progress.transfer(x)));
    if(ticket!==loadCount)return;
    report(progress.assetReady());
    model=gltf.scene;
    const materialCache=new Map();
    let triangleCount=0, meshCount=0;
    model.traverse(n=>{
      if(!n.isMesh)return;
      meshCount++; triangleCount+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;
      const original=Array.isArray(n.material)?n.material:[n.material];
      const converted=original.map(m=>{
        if(!materialCache.has(m)){
          const next=new THREE.MeshBasicMaterial({map:m.map||null,color:m.color,vertexColors:!!n.geometry.attributes.color,side:THREE.DoubleSide,transparent:m.transparent,opacity:m.opacity,alphaTest:m.alphaTest});
          if(next.map)next.map.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());
          materialCache.set(m,next); m.dispose();
        }
        return materialCache.get(m);
      });
      n.material=Array.isArray(n.material)?converted:converted[0];
    });
    scene.add(model);
    report(progress.prepareScene());
    const box=new THREE.Box3().setFromObject(model),c=box.getCenter(new THREE.Vector3()),r=box.getSize(new THREE.Vector3()).length()*.52;
    camera.near=.15; camera.far=Math.max(20000,r*14); camera.updateProjectionMatrix(); controls.maxDistance=r*7;
    for(const key of Object.keys(views))delete views[key];
    views.all=[c.clone().add(new THREE.Vector3(.9,1.1,1.25).multiplyScalar(r)).toArray(),c.toArray()];
    views.top=[c.clone().add(new THREE.Vector3(0,2,.001).multiplyScalar(r)).toArray(),c.toArray()];
    views.reverse=[c.clone().add(new THREE.Vector3(-.9,1,-1.2).multiplyScalar(r)).toArray(),c.toArray()];
    Object.assign(views,asset.presets||{});
    const initial=views[asset.initialView]||views.all;
    camera.position.fromArray(initial[0]); controls.target.fromArray(initial[1]); controls.update();
    renderer.render(scene,camera);report(progress.sceneReady());
    allButtons().forEach(b=>b.disabled=false);
    document.querySelectorAll('[data-view]').forEach(b=>b.disabled=!views[b.dataset.view]);
    selector.disabled=false; loading.style.display='none';
    document.getElementById('asset-note').textContent=asset.note||'';
    state.textContent='原始模型已载入 · 当前静止';
    host.dataset.sourceModel=asset.model;
    host.dataset.meshes=meshCount; host.dataset.triangles=Math.round(triangleCount);
  }catch(error){loading.textContent='模型载入失败，请重新打开检查页。'; state.textContent='载入失败';console.error(error);}
}
async function initialize(){
  allButtons().forEach(b=>b.disabled=true);
  try{
    metadata=await(await fetch('./source_model.json?t='+Date.now(),{cache:'no-store'})).json();
    if(metadata.status!=='ready'){document.getElementById('loading').textContent=metadata.message;setTimeout(initialize,5000);return;}
    const assets=metadata.models||[{id:'overview',label:'全区原始模型',...metadata}];
    selector.replaceChildren(...assets.map(a=>new Option(a.label,a.id)));
    selector.onchange=()=>activate(assets.find(a=>a.id===selector.value));
    await activate(assets.find(a=>a.id===metadata.default)||assets[0]);
  }catch(error){state.textContent='正在读取模型清单';setTimeout(initialize,5000);console.error(error);}
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>transition(...views[b.dataset.view]));
document.getElementById('rotate').onclick=()=>{move=null;rotating=!rotating;controls.autoRotate=rotating;document.getElementById('rotate').textContent=rotating?'暂停慢速旋转':'开始慢速旋转';state.textContent=rotating?'匀速旋转中':'画面已定格';};
document.getElementById('stop').onclick=stop; controls.addEventListener('start',stop);
function zoom(f){stop();const offset=camera.position.clone().sub(controls.target);offset.setLength(THREE.MathUtils.clamp(offset.length()*f,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(offset);controls.update();state.textContent='缩放完成 · 当前静止';}
document.getElementById('zoom-in').onclick=()=>zoom(.78); document.getElementById('zoom-out').onclick=()=>zoom(1.28);
document.getElementById('motion-play').onclick=async()=>{
  if(!model||motionPending)return;
  const message=document.getElementById('motion-state');
  try{
    if(!motion){
      motionPending=true; selector.disabled=true;message.textContent='正在加载人物与车辆…';
      const {createMotionPreview}=await import('./motion-preview.js');
      motion=await createMotionPreview({scene,ground:model,renderer});
      motionPending=false;selector.disabled=false;
    }
    const current=motion.status();
    if(current.running){motion.pause();message.textContent='人车预演已暂停';return;}
    if(current.finished)motion.reset();
    transition(...motion.cameraPreset);motion.play();
    message.textContent='人车短段预演 · 非最终疏散路线';
  }catch(error){motionPending=false;selector.disabled=false;message.textContent='人车预演尚未就绪';console.error(error);}
};
document.getElementById('motion-reset').onclick=()=>{if(motion){motion.pause();motion.reset();document.getElementById('motion-state').textContent='人车已回到起点';}};
renderer.domElement.addEventListener('dblclick',event=>{
  if(!model)return;
  const rect=renderer.domElement.getBoundingClientRect();
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
  const hit=ray.intersectObject(model,true)[0];if(!hit)return;
  const offset=camera.position.clone().sub(controls.target).setLength(Math.max(22,camera.position.distanceTo(hit.point)*.36));
  transition(hit.point.clone().add(offset).toArray(),hit.point.toArray());
});
new ResizeObserver(()=>{renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();}).observe(host);
let previous=performance.now();
function animate(now){
  requestAnimationFrame(animate);const dt=Math.min((now-previous)/1000,.1);previous=now;
  if(move){const u=Math.min((now-move.start)/1100,1),q=u*u*(3-2*u);camera.position.lerpVectors(move.from,move.to,q);controls.target.lerpVectors(move.targetFrom,move.targetTo,q);if(u===1){move=null;state.textContent='视角就位 · 当前静止';}}
  if(motion){motion.update(dt);const ms=motion.status();host.dataset.motion=JSON.stringify(ms);document.getElementById('motion-play').textContent=ms.running?'暂停人车预演':ms.finished?'重播人车预演':'播放人车预演';}
  controls.update(dt);renderer.render(scene,camera);
}
requestAnimationFrame(animate);initialize();
