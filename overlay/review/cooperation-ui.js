import {createCooperationSession} from './cooperation-core.js';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export class CooperationUI {
  constructor({data, catalog, engine, inventory, onMessage, onMode}) {
    Object.assign(this, {data, catalog, engine, inventory, onMessage, onMode});
    this.sessions = new Map();
    this.host = document.getElementById('cooperation-controls');
    this.card = document.createElement('aside');
    this.card.id = 'cooperation-card'; this.card.className = 'floating-panel'; this.card.hidden = true;
    this.card.setAttribute('aria-label', '岗位确认与异常处置');
    document.getElementById('workspace').append(this.card);
    this.note = document.createElement('div'); this.note.id = 'cooperation-map-note'; this.note.hidden = true;
    document.getElementById('workspace').append(this.note);
    this.select(new URLSearchParams(location.search).get('scenario') || data.scenarios[0].id);
  }
  select(id) {
    this.scenario = this.data.scenarios.find(item => item.id === id) || this.data.scenarios[0];
    if (!this.sessions.has(this.scenario.id)) this.sessions.set(this.scenario.id, createCooperationSession(this.scenario));
    this.session = this.sessions.get(this.scenario.id);
    this.draw();
    if (this.visible) this.focus();
  }
  setVisible(value) {
    this.visible = value; this.card.hidden = !value; this.note.hidden = !value;
    if (value) {this.draw(); this.focus();}
  }
  focus() {
    const step = this.scenario.steps[this.session.snapshot().index];
    const item = (this.catalog.objects || this.catalog).find(item => item.id === step.objectId);
    document.getElementById('detail-panel').hidden = true;
    this.inventory.highlights = item ? [item.id] : [];
    if (item?.position) this.engine.focus(item.position, item.kind === 'zone' ? 260 : 160);
  }
  action(result, refocus = false) {
    if (!result.ok) {this.onMessage(result.message); return;}
    this.draw(); if (refocus) this.focus();
  }
  export() {
    const report = {...this.session.report(), sources: this.data.sources.filter(item => this.scenario.sourceIds.includes(item.id))};
    const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], {type:'application/json;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = `金桥-实务推演-${this.scenario.id}-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  draw() {
    const s = this.session.snapshot(), sc = this.scenario, current = sc.steps[s.index];
    const objects = this.catalog.objects || this.catalog;
    const object = objects.find(item => item.id === current.objectId);
    const sources = this.data.sources.filter(item => sc.sourceIds.includes(item.id));
    const exception = {...sc.exception, ...(current.exception || {})};
    this.host.innerHTML = `<label class="field-label" for="practice-case">选择实务场景</label>
      <select id="practice-case">${this.data.scenarios.map(item => `<option value="${escape(item.id)}" ${item.id===sc.id?'selected':''}>${escape(item.title)}</option>`).join('')}</select>
      <p class="practice-goal">${escape(sc.goal)}</p>
      <div class="practice-progress"><strong>${s.completed.length} / ${sc.steps.length}</strong><span>${s.finished?'本轮完成':s.hold?'异常暂停':'步骤交接'}</span></div>
      <ol class="practice-stages">${sc.steps.map((step,index) => `<li class="${index===s.index?'current':index<s.index?'done':''}" ${index===s.index?'aria-current="step"':''}><span>${index<s.index||s.finished?'✓':index+1}</span><div><strong>${escape(step.title)}</strong><small>${escape(step.checks.map(item=>item.role).filter((role,index,array)=>array.indexOf(role)===index).join(' / '))}</small></div></li>`).join('')}</ol>
      <div class="coord-controls"><button id="practice-focus">定位本步区域</button><button id="practice-export">导出推演记录</button></div>
      <details class="practice-details"><summary>本案依据与讲解边界</summary><p>${escape(sc.objectBindingStatus)}</p>${sources.map(item=>`<a href="${escape(item.url)}" target="_blank" rel="noopener">${escape(item.publisher)} · ${escape(item.title)} ↗</a>`).join('')}<p>${escape(sc.demoBoundary)}</p></details>
      <a class="practice-brief" href="./briefing.html">查看合作亮点与试点建议 ↗</a>
      <p class="small-note">岗位由讲解者模拟确认。本轮记录保留在当前页面，刷新前请导出；未连接真实调度或设备。</p>`;
    this.note.innerHTML = `<strong>讲解区域 · ${escape(object?.label || '待核实')}</strong><span>${escape(sc.objectBindingStatus)}</span>`;
    this.card.innerHTML = `<div class="practice-card-heading"><span>实务推演 · ${escape(sc.id==='repair-relay'?'金桥公开业务案例':'铁路物流协同流程')}</span><b class="${s.hold?'hold':''}">${s.finished?'推演完成':s.hold?'暂停交接':'等待确认'}</b></div>
      <h2>${escape(current.title)}</h2><p class="practice-action">${escape(current.action)}</p>
      <div class="practice-risk"><strong>管理者看什么</strong><p>${escape(current.risk)}</p></div>
      ${s.finished ? `<div class="practice-finished"><strong>本轮 ${sc.steps.length} 步均已交接</strong><p>可导出带时间、岗位回执和异常处置的推演记录。现场效率需要接入真实记录后评估。</p><button id="practice-again">开始新一轮</button></div>` : s.hold ? this.holdMarkup(s.hold) : `<fieldset class="practice-checks"><legend>交接前的岗位确认</legend>${current.checks.map(check=>`<label><input type="checkbox" data-practice-check="${escape(check.id)}" ${s.checks[check.id]?'checked':''}><span>${escape(check.label)}<small>${escape(check.role)} · 演示确认</small></span></label>`).join('')}</fieldset>
      <label class="field-label" for="practice-evidence">本步回执 / 观察说明</label><textarea id="practice-evidence" rows="2" maxlength="2000" placeholder="填写本轮演示的依据、差异或观察结论">${escape(s.evidence)}</textarea>
      <button id="practice-advance" class="primary wide">${s.index===sc.steps.length-1?'完成本轮并留存记录':'确认交接，进入下一步'} →</button>
      <button id="practice-incident" class="practice-incident">插入异常：${escape(exception.trigger)}</button>`}
      <details class="practice-details"><summary>本轮操作记录（${s.events.length}）</summary><ol class="practice-log">${[...s.events].reverse().map(event=>`<li><time>${escape(event.at.slice(11,19))} UTC</time><strong>${escape(event.text)}</strong>${event.role?`<small>${escape(event.role)}</small>`:''}${event.evidence?`<p>${escape(event.evidence)}</p>`:''}</li>`).join('')}</ol></details>
      <details class="practice-details"><summary>试点可评估哪些指标</summary>${sc.metrics.map(metric=>`<p><strong>${escape(metric.label)}</strong> · 待采集<br>${escape(metric.definition)}</p>`).join('')}</details>`;
    this.host.querySelector('#practice-case').onchange = event => this.select(event.target.value);
    this.host.querySelector('#practice-focus').onclick = () => this.focus();
    this.host.querySelector('#practice-export').onclick = () => this.export();
    this.card.querySelectorAll('[data-practice-check]').forEach(input => input.onchange = () => {
      const id = input.dataset.practiceCheck;
      this.action(this.session.confirm(id, input.checked));
      this.card.querySelector(`[data-practice-check="${id}"]`)?.focus({preventScroll:true});
    });
    const evidence = this.card.querySelector('#practice-evidence');
    if (evidence) evidence.oninput = () => this.session.setEvidence(evidence.value);
    this.bind('practice-advance', () => this.action(this.session.advance(), true));
    this.bind('practice-incident', () => this.action(this.session.interrupt()));
    this.bind('practice-review', () => this.action(this.session.review(this.card.querySelector('#practice-resolution').value)));
    this.bind('practice-resume', () => this.action(this.session.resume(this.card.querySelector('#practice-dispatch').checked)));
    this.bind('practice-again', () => {this.export(); this.sessions.set(sc.id, createCooperationSession(sc)); this.select(sc.id);});
    document.getElementById('workspace').dataset.cooperation = JSON.stringify({scenarioId:sc.id, step:current.id, completed:s.completed.length, hold:!!s.hold, finished:s.finished});
  }
  bind(id, action) {const button = this.card.querySelector('#'+id); if (button) button.onclick = action;}
  holdMarkup(hold) {
    return `<section class="practice-hold" role="status"><strong>${escape(hold.trigger)}</strong><p>暂停：${escape(hold.blockedAction)}</p><p>${escape(hold.requiredAction)}</p><small>恢复条件：${escape(hold.resumeCondition)}</small></section>
      ${!hold.review?`<label class="field-label" for="practice-resolution">${escape(hold.reviewerRole)} · 处置与复核说明</label><textarea id="practice-resolution" rows="3" maxlength="2000" placeholder="记录处置结果、复核依据和遗留限制"></textarea><button id="practice-review" class="wide">记录复核通过（演示）</button>`:`<p class="practice-reviewed">复核依据：${escape(hold.review.note)}</p><label class="practice-dispatch"><input id="practice-dispatch" type="checkbox"><span>${escape(hold.dispatcherRole)} 已确认恢复安排<small>演示确认；恢复后需重新完成本步确认</small></span></label><button id="practice-resume" class="primary wide">确认恢复，重新检查本步</button>`}`;
  }
}
