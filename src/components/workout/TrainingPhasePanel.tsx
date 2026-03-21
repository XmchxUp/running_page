import { useState, useEffect } from 'react';
import { IS_CHINESE, PanelLabel } from './WorkoutUI';

export type TrainingPhase = {
  id: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  type: 'strength' | 'hypertrophy' | 'cut' | 'deload';
  label?: string;
};

const PHASES_KEY = 'workout_phases';

export const PHASE_COLORS: Record<TrainingPhase['type'], string> = {
  strength:    'rgba(99,102,241,0.25)',
  hypertrophy: 'rgba(16,185,129,0.22)',
  cut:         'rgba(239,68,68,0.18)',
  deload:      'rgba(245,158,11,0.18)',
};
export const PHASE_STROKE: Record<TrainingPhase['type'], string> = {
  strength:    'rgba(99,102,241,0.6)',
  hypertrophy: 'rgba(16,185,129,0.6)',
  cut:         'rgba(239,68,68,0.5)',
  deload:      'rgba(245,158,11,0.5)',
};

const PHASE_LABELS_CN: Record<TrainingPhase['type'], string> = {
  strength:    '力量',
  hypertrophy: '增肌',
  cut:         '减脂',
  deload:      '退量',
};

export const loadPhases = (): TrainingPhase[] => {
  try {
    return JSON.parse(localStorage.getItem(PHASES_KEY) ?? '[]');
  } catch {
    return [];
  }
};

const savePhases = (phases: TrainingPhase[]) => {
  localStorage.setItem(PHASES_KEY, JSON.stringify(phases));
};

export default function TrainingPhasePanel() {
  const [phases, setPhases] = useState<TrainingPhase[]>(loadPhases);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    start: '',
    end: '',
    type: 'strength' as TrainingPhase['type'],
    label: '',
  });

  useEffect(() => {
    savePhases(phases);
  }, [phases]);

  const handleAdd = () => {
    if (!form.start || !form.end || form.start > form.end) return;
    const newPhase: TrainingPhase = {
      id: Date.now().toString(),
      start: form.start,
      end: form.end,
      type: form.type,
      label: form.label || undefined,
    };
    setPhases((prev) => [...prev, newPhase].sort((a, b) => a.start.localeCompare(b.start)));
    setForm({ start: '', end: '', type: 'strength', label: '' });
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    setPhases((prev) => prev.filter((p) => p.id !== id));
  };

  const phaseTypeLabel = (type: TrainingPhase['type']) =>
    IS_CHINESE ? PHASE_LABELS_CN[type] : type.charAt(0).toUpperCase() + type.slice(1);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <PanelLabel style={{ marginBottom: 0 }}>
          {IS_CHINESE ? '训练阶段标注' : 'Training Phases'}
        </PanelLabel>
        <button onClick={() => setShowForm((v) => !v)}
          className="text-xs px-2.5 py-1 rounded-full transition-all"
          style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--wc-l3)' }}>
          {showForm ? (IS_CHINESE ? '取消' : 'Cancel') : (IS_CHINESE ? '+ 添加' : '+ Add')}
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="rounded-lg p-3 mb-3 space-y-2" style={{ background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.12)' }}>
          <div className="flex gap-2">
            <input type="date" value={form.start} onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
              className="flex-1 rounded px-2 py-1 text-xs"
              style={{ background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: 'inherit' }} />
            <span className="text-xs opacity-40 self-center">→</span>
            <input type="date" value={form.end} onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
              className="flex-1 rounded px-2 py-1 text-xs"
              style={{ background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: 'inherit' }} />
          </div>
          <div className="flex gap-2">
            <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as TrainingPhase['type'] }))}
              className="flex-1 rounded px-2 py-1 text-xs"
              style={{ background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: 'inherit' }}>
              {(['strength', 'hypertrophy', 'cut', 'deload'] as const).map((t) => (
                <option key={t} value={t}>{phaseTypeLabel(t)}</option>
              ))}
            </select>
            <input type="text" value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder={IS_CHINESE ? '备注（可选）' : 'Label (optional)'}
              className="flex-1 rounded px-2 py-1 text-xs"
              style={{ background: 'rgba(128,128,128,0.1)', border: '1px solid rgba(128,128,128,0.2)', color: 'inherit' }} />
          </div>
          <button onClick={handleAdd}
            className="w-full rounded py-1.5 text-xs font-semibold transition-all"
            style={{ background: 'rgba(99,102,241,0.2)', color: 'var(--wc-l3)' }}>
            {IS_CHINESE ? '保存阶段' : 'Save Phase'}
          </button>
        </div>
      )}

      {/* Phase list */}
      {phases.length === 0 ? (
        <div className="text-xs opacity-25 text-center py-3">
          {IS_CHINESE ? '暂无阶段标注，点击"+ 添加"创建' : 'No phases yet. Click "+ Add" to create one.'}
        </div>
      ) : (
        <div className="space-y-1.5">
          {phases.map((p) => (
            <div key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: PHASE_COLORS[p.type], border: `1px solid ${PHASE_STROKE[p.type]}` }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: PHASE_STROKE[p.type],
              }} />
              <span className="text-xs font-semibold" style={{ color: PHASE_STROKE[p.type] }}>
                {phaseTypeLabel(p.type)}
              </span>
              <span className="text-xs opacity-50 tabular-nums">{p.start} → {p.end}</span>
              {p.label && <span className="text-xs opacity-60 truncate flex-1">{p.label}</span>}
              <button onClick={() => handleDelete(p.id)} className="ml-auto text-xs opacity-30 hover:opacity-70 transition-opacity">✕</button>
            </div>
          ))}
        </div>
      )}

      {phases.length > 0 && (
        <div className="mt-2" style={{ fontSize: 9, opacity: 0.25 }}>
          {IS_CHINESE ? '阶段色带已显示在训练负荷图表上' : 'Phase bands are shown on the Training Load chart'}
        </div>
      )}
    </div>
  );
}
