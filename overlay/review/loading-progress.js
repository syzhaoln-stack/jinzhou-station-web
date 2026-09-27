// Progress describes the complete model-loading workflow, not elapsed time.
// Byte totals can be missing or smaller than decoded bytes (for example when
// compression is involved). Only sceneReady() may publish 100%.
const finiteNonnegative = value => Number.isFinite(value) && value >= 0 ? value : 0;
const assetCount = value => Number.isFinite(value) && value > 0 ? Math.max(1, Math.floor(value)) : 1;

export function createLoadingProgress(totalAssets = 1) {
  let count, completed, percent, phase, label, loaded, total, determinate;
  const snapshot = () => ({phase, label, percent, loaded, total, determinate, completed, totalAssets: count});
  const advance = value => { percent = Math.max(percent, Math.min(99, Math.floor(value))); };
  const api = {
    reset(nextCount = count ?? totalAssets) {
      count = assetCount(nextCount); completed = 0; percent = 0; phase = 'waiting';
      label = '模型'; loaded = 0; total = null; determinate = false;
      return snapshot();
    },
    startAsset(name = '模型') {
      if (phase === 'ready') return snapshot();
      phase = 'download'; label = name; loaded = 0; total = null; determinate = false;
      return snapshot();
    },
    transfer(event = {}) {
      if (phase !== 'download') return snapshot();
      loaded = Math.max(loaded, finiteNonnegative(event.loaded));
      total = event.lengthComputable !== false && Number.isFinite(event.total) && event.total > 0 ? event.total : null;
      determinate = total !== null;
      if (determinate) {
        // Reserve part of every asset's share for parsing and 5% for scene setup.
        const fraction = Math.min(1, loaded / total);
        advance(95 * (completed + fraction * .9) / count);
      }
      return snapshot();
    },
    assetReady() {
      if (phase !== 'download') return snapshot();
      completed = Math.min(count, completed + 1); phase = 'parsed'; determinate = true;
      advance(95 * completed / count);
      return snapshot();
    },
    prepareScene() {
      if (phase === 'ready') return snapshot();
      phase = 'preparing'; determinate = true; advance(99);
      return snapshot();
    },
    sceneReady() {
      phase = 'ready'; determinate = true; percent = 100;
      return snapshot();
    },
    snapshot
  };
  api.reset(totalAssets);
  return api;
}

export function formatLoadingProgress(progress) {
  if (progress.phase === 'ready') return '模型载入 100% · 场景已就绪';
  if (progress.phase === 'preparing') return `模型载入 ${progress.percent}% · 正在准备场景`;
  if (progress.phase === 'parsed') return `模型载入 ${progress.percent}% · 正在整理${progress.label}`;
  if (progress.phase === 'download') {
    if (progress.determinate) return `模型载入 ${progress.percent}% · 正在下载${progress.label}`;
    const bytes = finiteNonnegative(progress.loaded);
    const amount = bytes >= 1000000 ? `${(bytes / 1000000).toFixed(1)} MB` : bytes >= 1000 ? `${(bytes / 1000).toFixed(1)} KB` : `${Math.floor(bytes)} B`;
    return `正在下载${progress.label} · 已接收 ${amount}`;
  }
  return '正在准备载入模型…';
}
