export function installPresentationUI({engine,getMode,toast}){
  const names={cooperation:'实务推演',business:'业务与物联',protection:'安防与出入口',intro:'场站介绍',logistics:'铁路来货与短驳',coordination:'全场协同',drill:'应急演练',catalog:'设备台账',repair:'模型修复对照'};
  const controls=document.createElement('div');controls.id='presentation-controls';controls.innerHTML='<div class="presentation-identity"><span class="presentation-mark">╱╱</span><span>金桥铁路物流中心 <b id="presentation-part">场站介绍</b><small style="margin-left:12px;opacity:.65">演练示意</small></span></div><div><button id="presentation-caption" aria-pressed="true">讲解词</button><button id="presentation-exit">退出全屏 ↙</button></div>';document.getElementById('workspace').append(controls);
  function refresh(){document.getElementById('presentation-part').textContent=names[getMode()]||'三维演示';}
  async function enter(){document.body.classList.add('presentation');refresh();try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();}catch{toast?.('已展开三维展示，可用右上角按钮退出。');}engine.resize();}
  async function leave(){document.body.classList.remove('presentation');if(document.fullscreenElement)await document.exitFullscreen();engine.resize();}
  for(const panel of document.querySelectorAll('#context-panel>section')){const b=document.createElement('button');b.className='part-fullscreen';b.textContent='全屏展示这一部分 ↗';b.onclick=enter;panel.prepend(b);}
  const viewButton=document.createElement('button');viewButton.id='fullscreen-view';viewButton.textContent='全屏 ↗';viewButton.onclick=enter;document.querySelector('.view-tools').append(viewButton);
  document.getElementById('presentation-exit').onclick=leave;document.getElementById('presentation-caption').onclick=e=>{const hide=document.body.classList.toggle('presentation-no-caption');e.target.setAttribute('aria-pressed',String(!hide));};
  document.addEventListener('fullscreenchange',()=>{if(!document.fullscreenElement)document.body.classList.remove('presentation');engine.resize();});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('presentation'))leave();});
  return{enter,leave,refresh};
}
