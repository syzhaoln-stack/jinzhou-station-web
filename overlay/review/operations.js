import * as THREE from 'three';
import {SceneEngine} from './scene-engine.js?v=20260927-cooperation1';
import {installPresentationUI} from './presentation-ui.js';
import {CatalogUI} from './catalog-ui.js?v=20260927-ledger1';
import {StationLedgerUI} from './ledger-ui.js?v=20260927-ledger1';
import {createLedgerStore} from './ledger-management.js';
import {LedgerManagementUI} from './ledger-management-ui.js?v=20260927-ledger1';
import {CooperationUI} from './cooperation-ui.js?v=20260927-cooperation1';
import {createDrillSimulation} from './drill-simulation.js';
import {createNarrationPlayer,narrationForSimulation} from './narration-player.js';
const $=id=>document.getElementById(id);
const fetchJSON=async url=>{const r=await fetch(url+'?v='+Date.now());if(!r.ok)throw new Error(url+' 读取失败');return r.json();};
const timeText=t=>Math.floor(Math.max(0,t)/60).toString().padStart(2,'0')+':'+Math.floor(Math.max(0,t)%60).toString().padStart(2,'0');
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let business=null,businessPromise=null;
let logistics=null,logisticsPromise=null,presentation;
let coordination=null,coordinationPromise=null,personnel,protection=null;
let repairSelection='gantries';
let ledger,ledgerStore,ledgerManagement,ledgerSupplement,cooperation;
function syncLedger(){if(!ledgerStore)return;const data={...ledgerSupplement,...ledgerStore.getSnapshot()};ledger?.updateSupplement(data);if(inventory)inventory.ledgerData=ledger?.data;}
function showLedger(tab='objects',objectId=null){ledgerManagement?.setVisible(false);syncLedger();ledger?.open(tab,objectId);}
function showLedgerManagement(options={}){ledger?.setVisible(false);ledgerManagement?.open(options);}
let config,catalog,introSpec,drillSpec,narration,inventory,drill=null,drillPromise=null,mode='intro',workflow='comprehensive',elapsed=0,running=false,currentStageKey='',busy=false,exporting=false,manualCamera=false;
const audio=new Audio();audio.id='narration-audio';audio.hidden=true;document.body.append(audio);
const voice=createNarrationPlayer(audio,{onMessage:toast,onState:s=>{
  const labels={idle:'点击播放开始讲解',ready:'配音已就绪',loading:'配音加载中…',playing:'正在讲解',paused:'配音待播放',blocked:'点击试听以启用声音',error:'配音加载失败 · 可点击试听重试',ended:'本段配音结束',off:'配音已关闭',unavailable:'此处为自由查看，可试听场站介绍'};
  $('voice-status').textContent=(labels[s.state]||s.state)+(s.state==='playing'?' · '+Math.floor(s.time)+'秒':'');
  $('voice-status').dataset.state=s.state;$('voice-status').title=s.title||s.stage;
  $('voice-toggle').textContent=s.state==='blocked'?'开启配音':s.enabled?'配音开':'配音关';$('voice-toggle').setAttribute('aria-pressed',String(s.enabled));
}});
let toastTimer;
function toast(text){$('toast').textContent=text;$('toast').style.display='block';clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').style.display='none',5000);}
function videoLink(result){let link=$('video-result');if(!link){link=document.createElement('a');link.id='video-result';link.className='video-result';link.target='_blank';$('export-video').after(link);}link.href=result.videoUrl;link.textContent='播放生成的视频 ↗';}
async function monitorExport(result){
  try{const status=await (await fetch(result.statusUrl)).json();$('workspace').dataset.exportStatus=JSON.stringify(status);
    if(status.status==='complete'){videoLink(result);toast('配音视频已生成，可点击“播放生成的视频”。');return;}
    if(status.status==='error'||status.state==='error'){toast('视频封装未完成：'+(status.error||status.message));return;}
    setTimeout(()=>monitorExport(result),2500);
  }catch(error){toast('视频状态读取失败，请稍后重试。');}
}
function loading(type,text){$('loading').style.display=type==='loading'?'grid':'none';$('loading-text').textContent=text;$('scene-status').textContent=text;}
const engine=new SceneEngine($('view'),loading);
engine.onManual=()=>{manualCamera=true;};
engine.onBeforeLoad=()=>{business?.dispose();business=null;if(protection){protection.dispose();protection=null;}if(logistics){logistics.dispose();logistics=null;}if(coordination){coordination.dispose();coordination=null;}if(drill){drill.dispose();drill=null;}voice.reset();currentStageKey='';};

function stages(kind=mode,id=workflow){if(kind==='intro')return introSpec.stages;const wf=drillSpec.workflows.find(x=>x.id===id)||drillSpec.workflows[0];return wf.stageIds.map(key=>drillSpec.stages.find(x=>x.id===key));}
function timelineOf(items){let t=0;return items.map(x=>{const row={...x,start:t,end:t+x.duration};t=row.end;return row;});}
function total(kind=mode,id=workflow){return stages(kind,id).reduce((s,x)=>s+x.duration,0);}
function locate(t,kind=mode,id=workflow){const items=timelineOf(stages(kind,id));return items.find(x=>t<x.end)||items.at(-1);}
function pause(){running=false;business?.pause();protection?.pause();logistics?.pause();coordination?.pause();drill?.pause();voice.pause();$('play-pause').textContent='▶';$('play-pause').setAttribute('aria-label','开始播放');}
async function loadModel(view=engine.view,repaired=engine.repaired,preserve=false){
  if(busy)return;busy=true;pause();try{await engine.load(config,view,repaired,{preserve});$('model-choice').value=view;inventory?.renderLabels();}finally{busy=false;}
}
async function ensureDrill(){if(drill)return;if(drillPromise)return drillPromise;busy=true;loading('loading','正在准备真实场景中的演练人员与车辆…');drillPromise=(async()=>{try{drill=await createDrillSimulation({scene:engine.scene,ground:engine.ground,renderer:engine.renderer,catalog});drill.setWorkflow(workflow);}finally{busy=false;drillPromise=null;loading('ready','全景演练 · 人员、车辆及路线为示意配置');}})();return drillPromise;}
async function ensureCoordination(){
  if(coordination)return coordination;if(coordinationPromise)return coordinationPromise;
  busy=true;loading('loading','正在准备全场路网、通行窗口和具名人员…');
  coordinationPromise=(async()=>{try{const {createCoordinationUI}=await import('./coordination-ui.js');coordination=await createCoordinationUI({engine,catalog,personnel,onError:toast});return coordination;}finally{busy=false;coordinationPromise=null;loading('ready','全场协同 · 道路沿原模型核查，人员与窗口为示例');}})();return coordinationPromise;
}
async function enterCoordination(){try{if(drill){drill.dispose();drill=null;}if(engine.view!=='overview')await loadModel('overview',engine.repaired);await ensureCoordination();coordination.draw(true);}catch(e){toast('全场协同准备失败：'+e.message);console.error(e);}}
async function ensureLogistics(){if(logistics)return logistics;if(logisticsPromise)return logisticsPromise;busy=true;loading('loading','正在准备列车、可驱动门机与接箱车辆…');logisticsPromise=(async()=>{try{const {createLogisticsUI}=await import('./logistics-ui.js');logistics=await createLogisticsUI({engine,onError:toast});return logistics;}finally{busy=false;logisticsPromise=null;loading('ready','铁路接卸与场内短驳 · 示意配置');}})();return logisticsPromise;}
async function enterLogistics(){try{if(drill){drill.dispose();drill=null;}if(engine.view!=='overview'||!engine.repaired)await loadModel('overview',true);await ensureLogistics();logistics.draw(true);}catch(e){toast('物流演示准备失败：'+e.message);console.error(e);}}
async function enterProtection(){if(protection){protection.draw(true);return;}if(drill){drill.dispose();drill=null;}if(engine.view!=='overview'||!engine.repaired)await loadModel('overview',true);busy=true;loading('loading','正在准备安防与出入口演示…');try{const {createProtectionUI}=await import('./protection-ui.js');protection=await createProtectionUI({engine,catalog,personnel,onError:toast,audioAllowed:()=>voice.enabled,onBusy:value=>{busy=value;loading(value?'loading':'ready',value?'正在准备演练角色…':'安防与出入口 · 演练示意');}});}catch(e){toast(e.message);}finally{busy=false;loading('ready','安防与出入口 · 演练示意');}}
async function enterBusiness(){
  if(business)return business;
  if(businessPromise)return businessPromise;
  businessPromise=(async()=>{try{
    if(drill){drill.dispose();drill=null;}
    if(engine.view!=='overview'||!engine.repaired)await loadModel('overview',true);
    if(mode!=='business')return;
    busy=true;loading('loading','正在准备业务台账、候选传感点位与信号仿真…');
    const {createBusinessUI}=await import('./business-ui.js?v=20260917-1');
    const created=await createBusinessUI({engine,catalog,onError:toast});
    if(mode!=='business'){created.dispose();return;}
    business=created;
    return business;
  }catch(error){console.error(error);toast('业务仿真准备失败：'+error.message);}
  finally{businessPromise=null;busy=false;loading('ready','真实场站基座 · 候选点位、业务数据与信号均为模拟');}})();
  return businessPromise;
}
function setMode(next){
  pause();voice.reset();mode=next;document.body.dataset.mode=next;manualCamera=false;currentStageKey='';elapsed=0;document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===next));
  for(const id of ['intro','drill','logistics','coordination','catalog','repair','protection','business','cooperation'])$(id+'-panel').hidden=id!==next;
  cooperation?.setVisible(next==='cooperation');
  ledgerManagement?.setVisible(false);ledger?.setVisible(false);if(next==='catalog')showLedger();
  const headings={business:['业务与物联','从一只货箱到一份报告','在真实场站中关联台账、作业、设备信号与岗位处置。所有业务数据和点位为可替换的仿真配置。'],protection:['安防与出入口','从发现风险到安全处置','观察模拟监控越界警示、反恐避险、人员开门撤离及门口抬杆放行。'],logistics:['铁路来货','让一只货箱穿过全场','列车到达、门机接卸、卡车接箱和场内短驳，跟踪同一个货物编号。'],coordination:['全场协同','让不同作业穿过同一个场区','沿真实场坪，查看具名班组、车辆、路口占用与放行回执；比较有无协调的差别。'],intro:['场站介绍','从全景认识场站','沿仓库、作业场坪、楼群和铁路，查看场站的空间与运行关系。'],drill:['应急演练','火情出现之后','按步骤观察警告、通知、疏散、救援与集合清点。'],catalog:['设备台账','全场资产，一览可查','按区域查看房屋、设备、物料与人员，并统一处理巡检、报修、领用和管理待办。'],repair:['局部修复','保留场站，逐处比较','选择四台门机、B1 办公楼、11 辆确认车辆清理区或门禁，查看对应部位的局部处理。']};
  headings.cooperation=['实务推演','一项作业，逐岗交接','从真实业务案例出发，查看需要谁确认、异常如何暂停、满足什么条件才能恢复。'];
  const h=headings[next];$('mode-kicker').textContent=h[0];$('panel-title').textContent=h[1];$('panel-description').textContent=h[2];
  if(next!=='business'&&business){business.dispose();business=null;}if(next==='business')enterBusiness();
  if(next!=='protection'&&protection){protection.dispose();protection=null;}if(next==='protection')enterProtection();
  if(next!=='logistics'&&logistics){logistics.dispose();logistics=null;}if(next==='logistics')enterLogistics();presentation?.refresh();
  if(next!=='coordination'&&coordination){coordination.dispose();coordination=null;}if(next==='coordination')enterCoordination();
  if(next==='intro'){if(drill){drill.dispose();drill=null;}engine.home();}
  if(next==='catalog'||next==='repair'||next==='cooperation'){if(drill){drill.dispose();drill=null;}if(next!=='cooperation')inventory.highlights=[];}
  if(next==='cooperation'&&engine.view!=='overview')loadModel('overview',engine.repaired).then(()=>{if(mode==='cooperation')cooperation.focus();}).catch(e=>toast(e.message));
  $('context-panel').scrollTop=0;if(next==='repair')focusRepair().catch(e=>toast(e.message));renderHud();
}
function fillChapters(host,items,kind){host.replaceChildren();for(const [i,s]of items.entries()){const b=document.createElement('button');b.className='chapter';b.dataset.stage=s.id;b.innerHTML='<span class="step-number">'+String(i+1).padStart(2,'0')+'</span><strong>'+escape(s.title)+'</strong>';b.onclick=()=>jumpStage(s.id,kind);host.append(b);}}
function refreshChapters(){fillChapters($('intro-stages'),introSpec.stages,'intro');fillChapters($('workflow-stages'),stages('drill'),'drill');}
async function jumpStage(id,kind=mode){if(busy||exporting)return;if(mode!==kind)setMode(kind);pause();if(engine.view!=='overview')await loadModel('overview',engine.repaired);elapsed=timelineOf(stages(kind)).find(s=>s.id===id)?.start||0;manualCamera=false;currentStageKey='';if(kind==='drill'){await ensureDrill();drill.seek(elapsed);}renderHud(true);}
async function play(){
  if(mode==='cooperation'){toast('请在右侧完成岗位确认与交接；实务推演不自动跳过步骤。');return;}
  if(busy||exporting)return;voice.pause();if(mode==='business'){(await enterBusiness())?.play();return;}if(mode==='protection'){protection?.play();return;}if(mode==='logistics'){await ensureLogistics();logistics.play();return;}if(mode==='coordination'){await ensureCoordination();coordination.play();return;}if(mode==='catalog'||mode==='repair')setMode('intro');
  if(engine.view!=='overview')await loadModel('overview',engine.repaired);
  if(mode==='drill'){await ensureDrill();if(drill.status().finished){elapsed=0;drill.reset();}drill.seek(elapsed);drill.play();}
  else if(elapsed>=total())elapsed=0;
  running=true;manualCamera=false;renderHud(true);
}
function updateVoice(stage,localTime){
  const entry=narration?.entries?.find(x=>x.kind===mode&&x.stage===stage.id);
  voice.sync({entry,key:mode+'_'+stage.id,time:localTime,running:running&&!exporting});
}
function updateSimulationVoice(ui){
  const status=ui?.status(),entry=mode==='protection'?narration?.entries?.find(e=>e.kind==='short-capability'&&e.stage===({egress:'evacuation',gate:'evacuation'}[status?.scenario]||status?.scenario)):narrationForSimulation(mode,status,narration?.entries);
  voice.sync({entry,key:mode+'_'+status?.mode+'_'+entry?.stage,running:!!status?.running&&!exporting,followTimeline:false,keepPhrase:true});
}
function previewVoice(){
  pause();const status=mode==='protection'?protection?.status():mode==='logistics'?logistics?.status():mode==='coordination'?coordination?.status():null;
  const entry=mode==='protection'?narration?.entries?.find(e=>e.kind==='short-capability'&&e.stage===({egress:'evacuation',gate:'evacuation'}[status?.scenario]||status?.scenario)):status?narrationForSimulation(mode,status,narration?.entries):narration?.entries?.find(x=>x.kind===mode&&x.stage===locate(elapsed).id);
  voice.preview(entry||narration?.entries?.find(x=>x.kind==='intro'&&x.stage==='overview'));
}
function renderHud(forceCamera=false){
  if(mode==='cooperation')return;
  if(!introSpec||!inventory)return;if(mode==='business'){business?.draw();return;}if(mode==='protection'){protection?.draw(forceCamera);updateSimulationVoice(protection);return;}if(mode==='logistics'){logistics?.draw(forceCamera);updateSimulationVoice(logistics);return;}if(mode==='coordination'){coordination?.draw(forceCamera);updateSimulationVoice(coordination);return;}
  $('drill-metrics').hidden=mode!=='drill'||!drill;
  if(mode==='drill'&&drill){const d=drill.status();$('drill-metrics').textContent='人员清点 '+d.peopleCount+' / '+d.totalPeople+'　·　安全侧车辆驶离 '+d.vehiclesExited+' / '+d.totalVehicles;}
  if(mode==='catalog'||mode==='repair'){
    const item=mode==='repair'?repairObject():null;$('story-kicker').textContent=mode==='catalog'?'设备台账':'原始模型与局部替换';$('story-title').textContent=mode==='catalog'?'从清单到位置，从记录到处置':item.title;$('story-text').textContent=mode==='catalog'?'统一编号关联房屋、设备、物料与人员；展开台账查看清单和业务记录。所有拟定数据均已标注。':item.note;return;
  }
  const s=locate(elapsed),key=mode+'_'+s.id;const local=Math.max(0,elapsed-s.start);
  if(key!==currentStageKey){currentStageKey=key;manualCamera=false;forceCamera=true;}
  if(forceCamera&&!manualCamera)engine.setCamera(s.cameraPreset||s.camera);
  $('story-kicker').textContent=mode==='intro'?'场站介绍':(drillSpec.workflows.find(x=>x.id===workflow)?.title||'应急演练');$('story-title').textContent=s.title;$('story-text').textContent=s.text;
  $('play-pause').textContent=running?'Ⅱ':'▶';$('play-pause').setAttribute('aria-label',running?'暂停播放':'开始播放');$('timeline').max=total();$('timeline').value=elapsed;$('time-now').textContent=timeText(elapsed);$('time-total').textContent=timeText(total());
  document.querySelectorAll('.chapter').forEach(b=>b.classList.toggle('active',b.dataset.stage===s.id));inventory.highlights=s.highlightIds||[];
  $('workspace').dataset.playback=JSON.stringify({mode,workflow,stage:s.id,elapsed,duration:total(),running,stageElapsed:local});
  if(drill&&mode==='drill')$('workspace').dataset.drill=JSON.stringify(drill.status());
  updateVoice(s,local);
}
function repairObject(){
  const objects=catalog?.objects||catalog||[],find=id=>objects.find(o=>o.id===id),ids=['gantry_main','gantry_middle','gantry_rear_red','gantry_rear_orange'];
  const points=ids.map(id=>find(id)?.position).filter(Boolean),box=new THREE.Box3().setFromPoints(points.map(p=>new THREE.Vector3(...p))),center=points.length?box.getCenter(new THREE.Vector3()):new THREE.Vector3(158,50,-45),span=points.length?box.getSize(new THREE.Vector3()).length():550;
  const building=find('b1_01')?.position||[563.694,56.6826,-205.012];
  const choices={
    gantries:{title:'四台门机 · 全景概览',summary:config.repair?.summary||'四台门机按各自可见跨度、梁距和支腿型式作局部重建，保留原始场坪与轨道。',partNames:config.repair?.partNames||[],note:config.repair?.note||'尺寸为建模估计，非机械施工图。',images:config.repair?.images||[],camera:[[center.x+span*.20,center.y+span*.83,center.z+span*.79],center.toArray()],highlightIds:ids},
    b1:{title:'办公楼 B1 · 局部修复',summary:'按航拍与原模型核对 B1 主办公楼的原位轮廓、层次和立面关系，局部重建楼体；周边楼群继续保留。',partNames:['主楼原位轮廓与屋面层次','对应立面与窗带关系'],note:'本项只说明 B1 局部修复，不表示整个办公楼群全部重建；不可见细节含建模推定。',images:[{src:'./repairs/b1_before.png',label:'B1 · 原始外观'},{src:'./repairs/b1_after.png',label:'B1 · 局部修复对照'}],camera:[[building[0]+105,building[1]+71,building[2]+120],[building[0],building[1]-7,building[2]]],highlightIds:['b1_01']},
    cleanup:{title:'11 辆确认车辆 · 清理区',summary:'仅清理已经用原航拍和三维车体形状交叉确认的 11 辆扫描车辆，并补齐对应路面；未确认车辆及周边设备继续保留。',partNames:['V01–V11：已核对且获准处理的车辆','独立路面补片与原始外观对照'],note:'独立开关只影响这 11 辆车辆清理层。不是全场车辆全部清除；清理边缘在近景中仍可能可见。',images:[{src:'./repairs/cleanup_before.png',label:'确认车辆区域 · 原始外观'},{src:'./repairs/cleanup_after.png',label:'11 辆局部清理后'}],camera:[[402.8,78,-125.3],[450.8,36,-173.3]],highlightIds:[]},
    gate:{title:'门禁 · 推定开合构件',summary:'出入口位置依据原航拍和原模型。保留固定门柱、伸缩门主段与地面，将对应细杆作为独立可开合构件表达。',partNames:['影像可见车行出入口','可驱动门杆与演练开合状态'],note:'新门杆、驱动盒与应急开启方式属于演练推定，不代表本站真实门禁型号或控制系统。',images:[{src:'./repairs/gate_closed.png',label:'演练门禁 · 关闭状态'},{src:'./repairs/gate_open.png',label:'演练门禁 · 开启状态'}],camera:[[391,71,-52],[432.1,37.5,-93]],highlightIds:[]}
  };
  return choices[repairSelection]||choices.gantries;
}
function updateRepairControls(){
  $('show-original').classList.toggle('active',!engine.repaired);$('show-repaired').classList.toggle('active',engine.repaired);$('cleanup-toggle').checked=engine.cleanupEnabled!==false;$('cleanup-toggle').disabled=busy||!engine.repaired;
  $('cleanup-state').textContent=!engine.repaired?'原始对照中；切回修复视图后可单独开关车辆清理。':engine.cleanupEnabled!==false?'11 辆清理层已开启；其他局部修复保持显示。':'11 辆清理层已关闭，保留其原始外观；其他局部修复不变。';
}
async function focusRepair(){if(mode!=='repair'||busy||exporting)return;repairPanel();if(engine.view!=='overview')await loadModel('overview',engine.repaired,true);if(mode!=='repair')return;const item=repairObject();manualCamera=true;inventory.highlights=item.highlightIds;engine.setCamera(item.camera);}
async function setRepair(enabled){if(mode!=='repair'||busy||exporting)return;try{await loadModel('overview',enabled,true);updateRepairControls();toast(enabled?'已显示当前配置的局部修复，保持同一视角。':'已恢复原始摄影外观，保持同一视角。');}catch(e){updateRepairControls();toast('对照切换失败：'+e.message);}}
async function setCleanup(enabled){if(mode!=='repair'||busy||exporting||!engine.repaired){updateRepairControls();return;}const previous=engine.cleanupEnabled!==false;engine.cleanupEnabled=!!enabled;$('cleanup-toggle').disabled=true;try{await loadModel('overview',engine.repaired,true);toast(enabled?'已显示证据确认的 11 辆车辆清理结果。':'已恢复这 11 辆扫描车辆的原始外观。');}catch(e){engine.cleanupEnabled=previous;toast('车辆清理切换失败：'+e.message);}finally{updateRepairControls();}}
function repairPanel(){if(!config)return;const r=repairObject();$('repair-scope-note').textContent=r.title+' · 保留真实场站底座';$('repair-details').innerHTML='<p>'+escape(r.summary)+'</p><ul>'+(r.partNames||[]).map(x=>'<li>'+escape(x)+'</li>').join('')+'</ul><p class="small-note">'+escape(r.note)+'</p>';$('repair-images').innerHTML=(r.images||[]).map(x=>'<figure><a href="'+escape(x.src)+'" target="_blank" rel="noopener"><img loading="lazy" src="'+escape(x.src)+'" alt="'+escape(x.label)+'"></a><figcaption>'+escape(x.label)+'</figcaption></figure>').join('');updateRepairControls();}

document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{if(!busy&&!exporting)setMode(b.dataset.mode);});
$('intro-start').onclick=()=>{if(mode!=='intro')setMode('intro');play();};$('drill-start').onclick=()=>{if(mode!=='drill')setMode('drill');play();};
$('play-pause').onclick=()=>mode==='protection'?(protection?.status()?.running?protection.pause():play()):mode==='logistics'?(logistics?.status().running?logistics.pause():play()):mode==='coordination'?(coordination?.status().running?coordination.pause():play()):(running?pause():play());
document.querySelectorAll('[data-enter]').forEach(b=>b.onclick=()=>{if(!busy&&!exporting){if(b.dataset.scenario)cooperation?.select(b.dataset.scenario);setMode(b.dataset.enter);}});
$('workflow-choice').onchange=e=>{pause();workflow=e.target.value;elapsed=0;currentStageKey='';drill?.setWorkflow(workflow);refreshChapters();renderHud(true);};
for(const [id,delta]of [['previous-stage',-1],['next-stage',1]])$(id).onclick=()=>{if(mode==='protection'){protection?.step(delta);return;}if(mode==='logistics'){logistics?.step(delta);return;}if(mode==='coordination'){coordination?.step(delta);return;}if(!['intro','drill'].includes(mode))return;const list=stages(),s=locate(elapsed),i=list.findIndex(x=>x.id===s.id);jumpStage(list[Math.max(0,Math.min(list.length-1,i+delta))].id);};
$('timeline').oninput=async e=>{if(busy||exporting)return;if(mode==='protection'){protection?.jump(Number(e.target.value));return;}if(mode==='logistics'){logistics?.jump(Number(e.target.value));return;}if(mode==='coordination'){coordination?.jump(Number(e.target.value));return;}pause();elapsed=Number(e.target.value);if(mode==='drill'){await ensureDrill();drill.seek(elapsed);}manualCamera=false;renderHud(true);};
$('voice-toggle').onclick=()=>{voice.setEnabled(voice.blocked||!voice.enabled);renderHud();if(voice.enabled)voice.retry();};
$('voice-preview').onclick=previewVoice;
document.addEventListener('click',e=>{if(e.target.closest('#intro-start,#drill-start,#logistics-start,#coord-start,#protection-start,#rail-entry-view,#play-pause')){renderHud();const active=mode==='protection'?protection?.status()?.running:mode==='logistics'?logistics?.status().running:mode==='coordination'?coordination?.status().running:running;if(active)voice.retry();}});
$('model-choice').onchange=e=>{if(busy||exporting){e.target.value=engine.view;return;}if(e.target.value==='core'&&['logistics','coordination','drill','protection','business','cooperation'].includes(mode)){e.target.value=engine.view;toast('该流程沿全场路线运行。可在“局部修复”或“设备台账”查看主库精细模型。');return;}loadModel(e.target.value,engine.repaired).catch(e=>toast(e.message));};
$('home-view').onclick=()=>{manualCamera=true;engine.home();};$('top-view').onclick=()=>{manualCamera=true;engine.top();};$('zoom-in').onclick=()=>{manualCamera=true;engine.zoom(.78);};$('zoom-out').onclick=()=>{manualCamera=true;engine.zoom(1.28);};
$('labels-toggle').onclick=()=>{inventory.showLabels=!inventory.showLabels;$('labels-toggle').setAttribute('aria-pressed',String(inventory.showLabels));};
$('show-original').onclick=()=>setRepair(false);$('show-repaired').onclick=()=>setRepair(true);$('focus-repair').onclick=()=>focusRepair().catch(e=>toast(e.message));
$('repair-choice').onchange=e=>{if(mode!=='repair'||busy||exporting){e.target.value=repairSelection;return;}repairSelection=e.target.value;repairPanel();focusRepair().catch(error=>toast(error.message));};
$('cleanup-toggle').onchange=e=>setCleanup(e.target.checked);
let pointerStart;
engine.renderer.domElement.addEventListener('pointerdown',e=>pointerStart=[e.clientX,e.clientY]);
engine.renderer.domElement.addEventListener('pointerup',e=>{if(mode==='business')return;if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>5||e.button!==0)return;const hit=engine.hit(e.clientX,e.clientY);if(hit)inventory.hit(hit.point);});
engine.renderer.domElement.addEventListener('dblclick',e=>{const hit=engine.hit(e.clientX,e.clientY);if(hit)engine.focus(hit.point.toArray(),45);});

async function initialize(){
  try{[config,catalog,introSpec,drillSpec,narration,personnel]=await Promise.all([fetchJSON('./operations-config.json'),fetchJSON('./station-catalog.json'),fetchJSON('./station-intro.json'),fetchJSON('./drill-scenarios.json'),fetchJSON('./narration-manifest.json'),fetchJSON('./exercise-personnel.json')]);
    narration.entries.push(...(await fetchJSON('./short-film.json')).shots);
    for(const obj of (catalog.objects||catalog)){const assigned=personnel.people.filter(p=>p.homeBuilding===obj.id);if(assigned.length)obj.staff=assigned.map(p=>({name:p.name,role:p.role,count:p.mode==='driver'?'驾驶':'步行',status:p.role+' · 虚构演练人员'}));}
    inventory=new CatalogUI(engine,catalog,async item=>{ledger?.setVisible(false);ledgerManagement?.setVisible(false);pause();if(engine.view==='core'&&!engine.box.containsPoint(new THREE.Vector3(...item.position))){await loadModel('overview',engine.repaired);engine.focus(item.position,160);}});
    ledgerSupplement=await fetchJSON('./station-ledger.json');
    ledgerStore=createLedgerStore({catalog,supplement:ledgerSupplement});
    const locate=id=>{ledger?.setVisible(false);ledgerManagement?.setVisible(false);inventory.select(id);};
    ledger=new StationLedgerUI({catalog,supplement:ledgerSupplement,onLocate:locate,onManage:showLedgerManagement});
    ledgerManagement=new LedgerManagementUI({catalog,supplement:ledgerSupplement,store:ledgerStore,onBack:()=>showLedger(),onLocate:locate,onChange:syncLedger});
    inventory.onLedger=(tab,id)=>{if(mode!=='catalog')setMode('catalog');showLedger(tab,id);};
    inventory.onManage=id=>{if(mode!=='catalog')setMode('catalog');showLedgerManagement({tab:'archives',objectId:id});};
    const estimates=await fetchJSON('./inventory-estimates.json');ledger.updateEstimates(estimates);ledgerManagement.supplement={...ledgerSupplement,inventoryEstimates:estimates};
    syncLedger();$('catalog-open-ledger').onclick=()=>showLedger();$('catalog-open-todos').onclick=()=>showLedgerManagement({tab:'todos'});
    const cooperationData=await fetchJSON('./cooperation-scenarios.json');cooperation=new CooperationUI({data:cooperationData,catalog,engine,inventory,onMessage:toast});
    $('workflow-choice').replaceChildren(...drillSpec.workflows.map(x=>new Option(x.title,x.id)));refreshChapters();repairPanel();await loadModel(config.defaultView||'overview',true);renderHud(false);const requested=new URLSearchParams(location.search).get('part');if(['intro','logistics','coordination','drill','catalog','repair','protection','business','cooperation'].includes(requested))setMode(requested);$('workspace').dataset.ready='true';
  }catch(error){loading('loading','载入失败：'+error.message);console.error(error);}
}
let previous=performance.now();function animate(now){requestAnimationFrame(animate);if(exporting)return;const dt=Math.min((now-previous)/1000,.1);previous=now;if(mode==='business')business?.update(dt);if(mode==='protection'&&protection)protection.update(dt);if(mode==='logistics'&&logistics)logistics.update(dt);if(mode==='coordination'&&coordination)coordination.update(dt);if(running){if(mode==='intro'){elapsed=Math.min(total(),elapsed+dt);if(elapsed>=total())pause();}else if(mode==='drill'&&drill){drill.update(dt);elapsed=drill.status().elapsed;if(drill.status().finished)pause();}}renderHud();engine.render(dt,now);inventory?.renderLabels();}
presentation=installPresentationUI({engine,getMode:()=>mode,toast});
// Static first-visit buttons are visible before any model has loaded. Bind
// them immediately, retaining a single fullscreen control in each panel.
for(const panel of document.querySelectorAll('#context-panel>section')){const initial=panel.querySelector('[data-part-fullscreen]');if(!initial)continue;for(const generated of panel.querySelectorAll('.part-fullscreen'))if(generated!==initial)generated.remove();initial.onclick=()=>presentation.enter();}
requestAnimationFrame(animate);initialize();

// The export module renders the same scene at exact frame timestamps. It never
// substitutes a photo montage or records the operator's mouse movements.
$('export-video').onclick=async()=>{
  if(window.STATION_STATIC_HOST){window.open('./watch.html','_blank','noopener');return;}
  if(busy||exporting)return;pause();let director;exporting=true;
  document.body.classList.add('capture-busy');document.querySelectorAll('button,select,input,a').forEach(e=>{e.dataset.exportDisabled=e.disabled?'1':'0';e.disabled=true;e.inert=true;});engine.controls.enabled=false;$('export-video').textContent='正在导出…';delete $('workspace').dataset.exportError;
  try{
    if(business){business.dispose();business=null;}if(protection){protection.dispose();protection=null;}if(coordination){coordination.dispose();coordination=null;}if(logistics){logistics.dispose();logistics=null;}if(drill){drill.dispose();drill=null;}
    const [{exportSceneVideo},{createShortVideoDirector}]=await Promise.all([import('./video-export.js'),import('./short-film-director.js')]);
    const cleanupWasDisabled=engine.cleanupEnabled===false;engine.cleanupEnabled=true;if(engine.view!=='overview'||!engine.repaired||cleanupWasDisabled)await loadModel('overview',true);
    const shortNarration={entries:(await fetchJSON('./short-film.json')).shots};director=await createShortVideoDirector({engine,catalog,personnel});
    const result=await exportSceneVideo({engine,director,sequence:director.sequence,catalog,narration:shortNarration,onProgress:p=>{toast('正在生成完整配音视频 '+p+'%');$('workspace').dataset.exportProgress=p;}});
    $('workspace').dataset.exportResult=JSON.stringify(result);toast('视频画面已生成，正在合并配音。');monitorExport(result);
  }catch(error){console.error(error);toast('视频导出未完成：'+error.message);$('workspace').dataset.exportError=error.message;}
  finally{director?.dispose();exporting=false;document.body.classList.remove('capture-busy');document.querySelectorAll('[data-export-disabled]').forEach(e=>{e.disabled=e.dataset.exportDisabled==='1';e.inert=false;delete e.dataset.exportDisabled;});engine.controls.enabled=true;$('export-video').textContent='导出约103秒短片';previous=performance.now();setMode('intro');elapsed=0;currentStageKey='';renderHud(true);}
};
