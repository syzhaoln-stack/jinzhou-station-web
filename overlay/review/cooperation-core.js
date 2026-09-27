// Decision-driven tabletop exercise. Acknowledgements are demo records, never
// equipment commands, authenticated approvals or measured operating results.
export function createCooperationSession(scenario, {now = () => new Date().toISOString()} = {}) {
  if (!scenario?.steps?.length) throw new Error('场景缺少步骤');
  const state = {scenarioId: scenario.id, startedAt: now(), index: 0, completed: [], checks: {}, evidence: '', hold: null, events: [], finished: false};
  const copy = value => JSON.parse(JSON.stringify(value));
  const step = () => scenario.steps[state.index];
  const log = (type, text, extra = {}) => state.events.push({sequence: state.events.length + 1, at: now(), stepId: step().id, type, text, ...extra});
  const fail = message => ({ok: false, message});
  const snapshot = () => copy({...state, totalSteps: scenario.steps.length});
  log('start', '开始实务推演；岗位确认均为演示记录');
  return {
    snapshot,
    confirm(checkId, checked) {
      if (state.finished || state.hold) return fail('当前暂停或已完成，不能确认');
      const check = step().checks.find(item => item.id === checkId);
      if (!check) return fail('没有此确认项');
      state.checks[checkId] = !!checked;
      log('confirmation', `${checked ? '确认' : '撤回'}：${check.label}`, {role: check.role});
      return {ok: true};
    },
    setEvidence(value) {
      if (state.finished || state.hold) return fail('当前暂停或已完成，不能修改回执');
      state.evidence = String(value ?? '').slice(0, 2000);
      return {ok: true};
    },
    advance() {
      if (state.finished) return fail('本轮推演已完成');
      if (state.hold) return fail('异常尚未解除，不能交接下一步');
      const missing = step().checks.filter(item => !state.checks[item.id]);
      if (missing.length) return fail('请完成当前步骤的全部岗位确认');
      if (!state.evidence.trim()) return fail('请填写本步回执或观察说明');
      state.completed.push({stepId: step().id, at: now(), checks: copy(state.checks), evidence: state.evidence.trim()});
      log('handover', `${step().title} · 完成交接`, {evidence: state.evidence.trim()});
      if (state.index === scenario.steps.length - 1) {state.finished = true; log('complete', '本轮推演完成；不代表现场实际作业完成');}
      else {state.index++; state.checks = {}; state.evidence = '';}
      return {ok: true};
    },
    interrupt() {
      if (state.finished || state.hold) return fail('当前状态不能插入新异常');
      const exception = {...scenario.exception, ...(step().exception || {})};
      if (!exception.trigger) return fail('此场景未配置异常');
      state.hold = {...copy(exception), raisedAt: now(), review: null};
      // Preserve existing receipts in the log, but invalidate their approval.
      log('hold', exception.trigger, {blockedAction: exception.blockedAction, priorEvidence: state.evidence});
      state.checks = {}; state.evidence = '';
      return {ok: true};
    },
    review(note) {
      if (!state.hold) return fail('当前没有待处置异常');
      if (!String(note ?? '').trim()) return fail('请记录异常处置与复核依据');
      if (state.hold.review) return fail('已完成复核，等待派工岗位确认');
      state.hold.review = {at: now(), note: String(note).trim().slice(0, 2000), role: state.hold.reviewerRole};
      log('review', '异常处置复核已记录', {role: state.hold.reviewerRole, evidence: state.hold.review.note});
      return {ok: true};
    },
    resume(confirmed) {
      if (!state.hold?.review) return fail('请先记录异常处置复核');
      if (!confirmed) return fail('需要派工岗位单独确认恢复安排');
      log('resume', '恢复安排已确认；本步岗位确认需重新完成', {role: state.hold.dispatcherRole, review: copy(state.hold.review)});
      state.hold = null; state.checks = {}; state.evidence = '';
      return {ok: true};
    },
    report() {
      return {schemaVersion: '1.0', type: 'cooperation-tabletop-demo', notice: '演示人员填写的推演记录，非实际作业指令、认证审批或实测运营数据。', scenarioTitle: scenario.title, sourceIds: scenario.sourceIds, objectBindingStatus: scenario.objectBindingStatus, exportedAt: now(), ...snapshot()};
    }
  };
}
