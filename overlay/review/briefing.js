const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : ''; } catch { return ''; } };
const modes = {catalog:'catalog', logistics:'logistics', coordination:'coordination', sitewide:'coordination', business:'business', practice:'cooperation', cooperation:'cooperation'};
const entry = (mode, scenario) => `./operations.html?part=${modes[mode] || 'cooperation'}${scenario ? '&scenario=' + encodeURIComponent(scenario) : ''}`;
const external = (url, label) => safeUrl(url) ? `<a href="${escape(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${escape(label)} ↗</a>` : escape(label);
let research, locationData, selectedScenario, selectedStep = 0;

function renderLocation(data) {
  const coordinate = data.coordinates;
  $('location-content').innerHTML = `<article class="location-main"><p class="kicker">公开报道称谓</p><h3>${escape(data.publicName)}</h3><p class="muted">本项目使用名称：${escape(data.siteName)}</p><p class="address">${escape(data.address)}</p><p class="note">门牌号与接待门岗待确认；请勿把场站参考中心直接作为车辆导航终点。</p><dl class="field-list"><dt>业务组织</dt><dd>${escape(data.operator)}</dd><dt>资料状态</dt><dd>${escape(data.identityStatus)}</dd><dt>航拍资料</dt><dd>${escape(data.imageryDate)} · 无人机实景航拍<br>当前展示为历史局部影像。</dd></dl></article><article class="location-reference"><p class="kicker">航拍覆盖参考中心 · WGS84</p><p class="coordinate">${coordinate.lat.toFixed(6)}<span>N</span>${coordinate.lon.toFixed(6)}<span>E</span></p><p class="muted">由航拍相机位置范围计算；用于找准场站区域，不代表接待入口、建筑测量点或场站边界。</p><div class="map-links">${data.mapLinks.map(link => external(link.url, link.label)).join('')}</div><p class="note">项目航拍日期为 2025-04-29；外部卫星/航空影像的拍摄日期需在地图服务中核对，两者均不标为实时。</p><p class="reference-note">开展设备精确定位、场界管理或面积统计前，需要确认边界与实测控制点，并完成模型配准。地图位置与来源见页末。</p></article>`;
}

function renderHighlights(index = 0) {
  const active = research.highlights[index];
  $('highlight-tabs').innerHTML = research.highlights.map((item, itemIndex) => `<button class="highlight-tab" type="button" data-highlight="${itemIndex}" aria-pressed="${index === itemIndex}" aria-controls="highlight-content"><span class="tab-symbol" aria-hidden="true">${['物','事','场','协','据'][itemIndex] || '·'}</span><span>${escape(item.title)}</span></button>`).join('');
  $('highlight-content').innerHTML = `<p class="kicker">管理者可以看到什么</p><h3>${escape(active.title)}</h3><p class="highlight-value">${escape(active.managerValue)}</p><p class="highlight-evidence"><strong>已有成果</strong>${escape(active.currentEvidence)}</p><a class="button primary" href="${escape(entry(active.entryMode, active.entryMode === 'practice' ? 'repair-relay' : undefined))}">进入对应功能 <span aria-hidden="true">↗</span></a><p class="highlight-limit">当前边界：${escape(active.limitations)}</p>`;
}

function sourceLinks(ids) {
  return ids.map(id => research.sources.find(source => source.id === id)).filter(Boolean).map(source => external(source.url, `${source.publisher} · ${source.date || '公开资料'}`)).join('；');
}

function renderScenario(id, stepIndex = 0) {
  selectedScenario = research.scenarios.find(item => item.id === id) || research.scenarios[0];
  selectedStep = Math.max(0, Math.min(stepIndex, selectedScenario.steps.length - 1));
  const scene = selectedScenario;
  const labels = {'repair-relay':'金桥公开业务案例','arrival-handover':'日常作业与交接','weather-coordination':'异常处置与协同'};
  $('scenario-tabs').innerHTML = research.scenarios.map(item => `<button type="button" class="scenario-tab" data-scenario="${escape(item.id)}" aria-pressed="${item.id === scene.id}" aria-controls="scenario-content"><span>${escape(labels[item.id] || '业务推演')}</span><strong>${escape(item.title)}</strong></button>`).join('');
  $('scenario-content').innerHTML = `<div class="scenario-heading"><div><span class="tag">${escape(labels[scene.id] || '业务推演')} · 交流推演</span><h3>${escape(scene.title)}</h3><p>${escape(scene.goal)}</p></div><a class="button primary" href="${escape(entry('cooperation', scene.id))}">进入三维推演 <span aria-hidden="true">↗</span></a></div><p class="scenario-source">业务依据：${sourceLinks(scene.id === 'repair-relay' ? ['jinqiao-repair-20260825'] : scene.sourceIds.slice(0, 2))}</p><div class="flow" aria-label="选择流程步骤">${scene.steps.map((step, index) => `<button type="button" class="flow-step" data-step="${index}" aria-pressed="${index === selectedStep}" aria-controls="step-detail"><span>STEP ${String(index + 1).padStart(2, '0')}</span><strong>${escape(step.title)}</strong></button>`).join('')}</div><div id="step-detail" class="step-detail"></div><div class="metric-grid">${scene.metrics.map(metric => `<div class="metric"><h4>${escape(metric.label)}</h4><p>${escape(metric.definition)}</p><small>建议试点采集 · 尚无实测结果</small></div>`).join('')}</div><p class="scenario-boundary">${escape(scene.demoBoundary)}${scene.objectBindingStatus ? ' ' + escape(scene.objectBindingStatus) : ''}</p>`;
  renderStep(selectedStep);
}

function renderStep(index) {
  selectedStep = Math.max(0, Math.min(index, selectedScenario.steps.length - 1));
  const step = selectedScenario.steps[selectedStep];
  document.querySelectorAll('[data-step]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.step) === selectedStep)));
  $('step-detail').innerHTML = `<div><span class="step-label">这一步做什么</span><h4>${escape(step.title)}</h4><p>${escape(step.action)}</p></div><div class="confirmation"><span class="step-label">由谁确认 · 如何交给下一步</span><p>${escape(step.confirmation)}</p><p class="step-outcome"><strong>完成后：</strong>${escape(step.outcome)}</p>${step.exception ? `<p class="step-outcome"><strong>异常时：</strong>${escape(step.exception.requiredAction)}，满足复核条件后再继续。</p>` : ''}</div>`;
}

function renderPilot() {
  $('pilot-content').innerHTML = research.pilot.map((item, index) => `<article class="pilot-card"><span class="priority">${String(index + 1).padStart(2, '0')} / ${item.priority === 'P0' ? '试点基础' : '验证与复制'}</span><h3>${escape(item.title)}</h3><p>${escape(item.deliverable)}</p><p class="acceptance"><strong>如何验收</strong>${escape(item.acceptance)}</p></article>`).join('');
}

function renderSources() {
  const seen = new Set();
  const sources = [...locationData.sources, ...research.sources].filter(source => {
    const key = source.url || source.title;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  $('sources-content').innerHTML = sources.map(source => `<article class="source">${source.url ? external(source.url, source.title) : `<strong>${escape(source.title)}</strong>`}<p class="publisher">${escape(source.publisher)}${source.date || source.publishedAt ? ' · ' + escape(source.date || source.publishedAt) : ''}</p><p>${escape(source.claim)}</p>${source.scope ? `<p>适用范围：${escape(source.scope)}</p>` : ''}${!source.url ? '<p>依据项目本地航拍审计记录；原始资料未在此公开。</p>' : ''}</article>`).join('');
}

document.addEventListener('click', event => {
  const highlight = event.target.closest('[data-highlight]');
  if (highlight) { const index = Number(highlight.dataset.highlight); renderHighlights(index); document.querySelector(`[data-highlight="${index}"]`).focus({preventScroll:true}); }
  const scenario = event.target.closest('[data-scenario]');
  if (scenario) { const id = scenario.dataset.scenario; renderScenario(id); document.querySelector(`[data-scenario="${id}"]`).focus({preventScroll:true}); const url = new URL(location.href); url.searchParams.set('scenario', id); history.replaceState(null, '', url); }
  const step = event.target.closest('[data-step]');
  if (step) renderStep(Number(step.dataset.step));
});
$('print-page').addEventListener('click', () => window.print());
let previouslyOpen;
window.addEventListener('beforeprint', () => { const details = $('sources').querySelector('details'); previouslyOpen = details.open; details.open = true; });
window.addEventListener('afterprint', () => { $('sources').querySelector('details').open = Boolean(previouslyOpen); });

async function initialize() {
  try {
    const responses = await Promise.all(['./site-location.json', './cooperation-scenarios.json'].map(async path => {
      const response = await fetch(path, {cache:'no-cache'});
      if (!response.ok) throw new Error(`资料读取失败：${response.status}`);
      return response.json();
    }));
    [locationData, research] = responses;
    renderLocation(locationData); renderHighlights(); renderScenario(new URL(location.href).searchParams.get('scenario')); renderPilot(); renderSources();
    $('data-notice').textContent = research.notice;
    $('as-of').textContent = research.asOf;
    $('page-status').textContent = '';
    document.body.dataset.ready = 'true';
  } catch (error) {
    $('page-status').classList.add('error');
    $('page-status').textContent = '场站资料暂未读取成功，请刷新页面重试，或从右上角进入三维场站。';
    console.error(error);
  }
}
initialize();
