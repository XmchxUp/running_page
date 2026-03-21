import { useState, useMemo } from 'react';
import type { WorkoutSession } from '@/types/workout';
import { calcE1RM, calcWILKS } from '@/utils/workoutCalcs';
import { IS_CHINESE, PanelLabel } from './WorkoutUI';

const BW_KEY = 'workout_bodyweight';
const SEX_KEY = 'workout_sex';

const WILKS_LEVELS = IS_CHINESE
  ? [
    { label: '入门', min: 0,   max: 150, color: '#6b7280' },
    { label: '中级', min: 150, max: 250, color: '#3b82f6' },
    { label: '高级', min: 250, max: 350, color: '#8b5cf6' },
    { label: '精英', min: 350, max: 450, color: '#f59e0b' },
    { label: '世界级', min: 450, max: 999, color: '#ef4444' },
  ]
  : [
    { label: 'Beginner',    min: 0,   max: 150, color: '#6b7280' },
    { label: 'Intermediate', min: 150, max: 250, color: '#3b82f6' },
    { label: 'Advanced',    min: 250, max: 350, color: '#8b5cf6' },
    { label: 'Elite',       min: 350, max: 450, color: '#f59e0b' },
    { label: 'World-class', min: 450, max: 999, color: '#ef4444' },
  ];

// detect best e1RM for an exercise matching a pattern
const getBestE1RM = (workouts: WorkoutSession[], patterns: RegExp[]): number => {
  let best = 0;
  workouts.forEach((w) => {
    w.exercises.forEach((ex) => {
      if (!patterns.some((p) => p.test(ex.name))) return;
      ex.sets.forEach((s) => {
        if (['normal', 'dropset', 'failure'].includes(s.type) && s.weight_kg && s.reps) {
          const e1rm = calcE1RM(s.weight_kg, s.reps);
          if (e1rm > best) best = e1rm;
        }
      });
    });
  });
  return Math.round(best * 10) / 10;
};

const SQUAT_PAT  = [/squat/i, /深蹲/];
const BENCH_PAT  = [/bench\s*press/i, /卧推/];
const DEADLIFT_PAT = [/deadlift/i, /硬拉/];

export default function WILKSPanel({ workouts }: { workouts: WorkoutSession[] }) {
  const savedBW  = parseFloat(localStorage.getItem(BW_KEY) ?? '') || 0;
  const savedSex = (localStorage.getItem(SEX_KEY) ?? 'm') as 'm' | 'f';
  const [bwInput, setBwInput] = useState(savedBW > 0 ? String(savedBW) : '');
  const [sex, setSex] = useState<'m' | 'f'>(savedSex);
  const [confirmed, setConfirmed] = useState(savedBW > 0);

  const lifts = useMemo(() => ({
    squat:    getBestE1RM(workouts, SQUAT_PAT),
    bench:    getBestE1RM(workouts, BENCH_PAT),
    deadlift: getBestE1RM(workouts, DEADLIFT_PAT),
  }), [workouts]);

  const bw = parseFloat(bwInput) || 0;
  const total = lifts.squat + lifts.bench + lifts.deadlift;
  const wilks = confirmed && bw > 0 && total > 0 ? calcWILKS(bw, total, sex === 'm') : 0;

  const level = WILKS_LEVELS.find((l) => wilks >= l.min && wilks < l.max) ?? WILKS_LEVELS[0];
  const barPct = Math.min((wilks / 500) * 100, 100);

  const handleConfirm = () => {
    const v = parseFloat(bwInput);
    if (v > 0) {
      localStorage.setItem(BW_KEY, String(v));
      localStorage.setItem(SEX_KEY, sex);
      setConfirmed(true);
    }
  };

  return (
    <div>
      <PanelLabel>WILKS {IS_CHINESE ? '力量评分' : 'Score'}</PanelLabel>

      {/* Auto-detected lifts */}
      <div className="flex gap-2 mb-4">
        {[
          { key: IS_CHINESE ? '深蹲' : 'Squat',    val: lifts.squat },
          { key: IS_CHINESE ? '卧推' : 'Bench',    val: lifts.bench },
          { key: IS_CHINESE ? '硬拉' : 'Deadlift', val: lifts.deadlift },
        ].map(({ key, val }) => (
          <div key={key} className="flex-1 rounded-lg p-2 text-center" style={{ background: 'rgba(128,128,128,0.08)' }}>
            <div style={{ fontSize: 9, opacity: 0.4, marginBottom: 2 }}>{key}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: val > 0 ? 'var(--wc-l3)' : undefined, opacity: val > 0 ? 1 : 0.25 }}>
              {val > 0 ? `${val} kg` : '—'}
            </div>
          </div>
        ))}
      </div>

      {/* Input row */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid rgba(128,128,128,0.2)' }}>
          {(['m', 'f'] as const).map((s) => (
            <button key={s} onClick={() => { setSex(s); setConfirmed(false); }}
              style={{
                padding: '4px 10px', fontSize: 11,
                background: sex === s ? 'rgba(99,102,241,0.25)' : 'transparent',
                color: sex === s ? 'var(--wc-l3)' : undefined,
              }}>
              {s === 'm' ? (IS_CHINESE ? '男' : 'M') : (IS_CHINESE ? '女' : 'F')}
            </button>
          ))}
        </div>
        <input
          type="number" min="30" max="200" step="0.5"
          value={bwInput}
          onChange={(e) => { setBwInput(e.target.value); setConfirmed(false); }}
          placeholder={IS_CHINESE ? '体重 kg' : 'BW kg'}
          className="flex-1 rounded-lg px-3 py-1.5 text-sm"
          style={{
            background: 'rgba(128,128,128,0.08)',
            border: '1px solid rgba(128,128,128,0.2)',
            outline: 'none',
            color: 'inherit',
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
        />
        <button onClick={handleConfirm}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
          style={{ background: 'rgba(99,102,241,0.2)', color: 'var(--wc-l3)' }}>
          {IS_CHINESE ? '计算' : 'Calc'}
        </button>
      </div>

      {/* Result */}
      {wilks > 0 ? (
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-3xl font-black tabular-nums" style={{ color: level.color }}>{wilks}</span>
            <div className="text-right">
              <div className="text-sm font-bold" style={{ color: level.color }}>{level.label}</div>
              <div style={{ fontSize: 10, opacity: 0.4 }}>
                {IS_CHINESE ? `三项合计 ${total} kg` : `Total ${total} kg`}
              </div>
            </div>
          </div>
          {/* Progress bar */}
          <div className="rounded-full overflow-hidden mb-2" style={{ height: 6, background: 'rgba(128,128,128,0.15)' }}>
            <div style={{ width: `${barPct}%`, height: '100%', background: level.color, borderRadius: 9999, transition: 'width 0.6s ease' }} />
          </div>
          {/* Level scale */}
          <div className="flex justify-between" style={{ fontSize: 8, opacity: 0.3 }}>
            {WILKS_LEVELS.map((l) => <span key={l.label}>{l.min}</span>)}
            <span>500+</span>
          </div>
        </div>
      ) : (
        <div className="text-xs opacity-30 text-center py-4">
          {total === 0
            ? (IS_CHINESE ? '未找到深蹲/卧推/硬拉数据' : 'No squat/bench/deadlift data found')
            : (IS_CHINESE ? '请输入体重并点击计算' : 'Enter bodyweight and click Calc')}
        </div>
      )}
    </div>
  );
}
