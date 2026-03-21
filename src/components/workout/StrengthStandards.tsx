import { useMemo } from 'react';
import type { WorkoutSession } from '@/types/workout';
import { calcE1RM } from '@/utils/workoutCalcs';
import { IS_CHINESE } from './WorkoutUI';

const BW_KEY = 'workout_bodyweight';

// Strength standards as bodyweight multipliers (male)
const STANDARDS = {
  squat:    { ratios: [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0], labelCN: '深蹲', label: 'Squat',    pat: /squat/i },
  bench:    { ratios: [0.35, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75], labelCN: '卧推', label: 'Bench',    pat: /bench\s*press/i },
  deadlift: { ratios: [0.5, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5],  labelCN: '硬拉', label: 'Deadlift', pat: /deadlift/i },
  ohp:      { ratios: [0.2, 0.35, 0.5, 0.65, 0.8, 1.0, 1.2],   labelCN: '推举', label: 'OHP',      pat: /overhead\s*press|shoulder\s*press|ohp|military/i },
} as const;

type LiftKey = keyof typeof STANDARDS;

const LEVEL_LABELS = IS_CHINESE
  ? ['未训练', '初学', '新手', '中级', '高级', '精英', '世界']
  : ['Untrained', 'Beginner', 'Novice', 'Inter.', 'Advanced', 'Elite', 'World'];

const LEVEL_COLORS = ['#6b7280', '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'];

function getBestE1RM(workouts: WorkoutSession[], pat: RegExp): number {
  let best = 0;
  workouts.forEach((w) => {
    w.exercises.forEach((ex) => {
      if (!pat.test(ex.name)) return;
      ex.sets.forEach((s) => {
        if (['normal', 'dropset', 'failure'].includes(s.type) && s.weight_kg && s.reps) {
          const e1rm = calcE1RM(s.weight_kg, s.reps);
          if (e1rm > best) best = e1rm;
        }
      });
    });
  });
  return Math.round(best * 10) / 10;
}

function getLevelIndex(e1rm: number, bw: number, ratios: readonly number[]): number {
  const ratio = e1rm / bw;
  let level = -1;
  for (let i = 0; i < ratios.length; i++) {
    if (ratio >= ratios[i]) level = i;
  }
  return level;
}

// Simple SVG radar chart — 4 axes
const RADAR_SIZE = 160;
const RC = RADAR_SIZE / 2;
const AXES = ['squat', 'bench', 'deadlift', 'ohp'] as LiftKey[];
const AXIS_ANGLES = [-90, 0, 90, 180]; // top, right, bottom, left

function radarPoint(axisDeg: number, r: number) {
  const rad = (axisDeg * Math.PI) / 180;
  return { x: RC + r * Math.cos(rad), y: RC + r * Math.sin(rad) };
}

export default function StrengthStandards({ workouts }: { workouts: WorkoutSession[] }) {
  const bw = parseFloat(localStorage.getItem(BW_KEY) ?? '') || 0;

  const lifts = useMemo(() => Object.fromEntries(
    Object.entries(STANDARDS).map(([key, { pat }]) => [key, getBestE1RM(workouts, pat)])
  ) as Record<LiftKey, number>, [workouts]);

  const levels = useMemo(() => {
    if (bw <= 0) return null;
    return Object.fromEntries(
      Object.entries(STANDARDS).map(([key, { ratios }]) => [
        key, getLevelIndex(lifts[key as LiftKey], bw, ratios)
      ])
    ) as Record<LiftKey, number>;
  }, [lifts, bw]);

  if (bw <= 0) {
    return (
      <div className="text-center py-6">
        <div style={{ fontSize: 12, opacity: 0.4 }}>
          {IS_CHINESE ? '请先在 WILKS 面板输入体重' : 'Enter bodyweight in the WILKS panel first'}
        </div>
      </div>
    );
  }

  // Radar: normalize each axis to 0-1 based on world standard
  const R_MAX = 65;
  const userPoints = AXES.map((key, i) => {
    const { ratios } = STANDARDS[key];
    const worldKg = ratios[ratios.length - 1] * bw;
    const ratio = Math.min(lifts[key] / worldKg, 1);
    return radarPoint(AXIS_ANGLES[i], ratio * R_MAX);
  });
  const userPath = userPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';

  // Reference rings at each level
  const levelRings = [0.25, 0.5, 0.7, 0.85, 1.0];

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.1em] opacity-40 mb-3">
        {IS_CHINESE ? '力量水平对标' : 'Strength Standards'}
      </div>
      <div style={{ fontSize: 9, opacity: 0.3, marginBottom: 12 }}>
        {IS_CHINESE ? `体重 ${bw}kg · e1RM 估算 · 参考 Symmetric Strength` : `BW ${bw}kg · e1RM estimated · Ref: Symmetric Strength`}
      </div>

      <div className="flex flex-col items-center mb-4">
        <svg width={RADAR_SIZE} height={RADAR_SIZE} viewBox={`0 0 ${RADAR_SIZE} ${RADAR_SIZE}`}>
          {/* Reference rings */}
          {levelRings.map((f, i) => {
            const pts = AXES.map((_, ai) => radarPoint(AXIS_ANGLES[ai], f * R_MAX));
            const path = pts.map((p, pi) => `${pi === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + ' Z';
            return <path key={i} d={path} fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth={1} />;
          })}
          {/* Axis lines */}
          {AXES.map((_, i) => {
            const p = radarPoint(AXIS_ANGLES[i], R_MAX);
            return <line key={i} x1={RC} y1={RC} x2={p.x} y2={p.y} stroke="rgba(128,128,128,0.15)" strokeWidth={1} />;
          })}
          {/* User polygon */}
          <path d={userPath} fill="rgba(99,102,241,0.2)" stroke="rgba(99,102,241,0.8)" strokeWidth={2}
            style={{ filter: 'drop-shadow(0 0 4px rgba(99,102,241,0.4))' }} />
          {/* User dots */}
          {userPoints.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={4} fill="rgba(99,102,241,1)" />
          ))}
          {/* Axis labels */}
          {AXES.map((key, i) => {
            const p = radarPoint(AXIS_ANGLES[i], R_MAX + 12);
            return (
              <text key={i} x={p.x} y={p.y} textAnchor="middle" dominantBaseline="middle"
                fill="currentColor" fontSize={8.5} opacity={0.45}>
                {IS_CHINESE ? STANDARDS[key].labelCN : STANDARDS[key].label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Per-lift rows */}
      <div className="space-y-3">
        {AXES.map((key) => {
          const { ratios, labelCN, label } = STANDARDS[key];
          const e1rm = lifts[key];
          const levelIdx = levels ? levels[key] : -1;
          const nextIdx = levelIdx + 1;
          const nextKg = nextIdx < ratios.length ? ratios[nextIdx] * bw : null;
          const prevKg = levelIdx >= 0 ? ratios[levelIdx] * bw : 0;
          const progress = nextKg ? Math.max(0, Math.min(1, (e1rm - prevKg) / (nextKg - prevKg))) : 1;
          const levelColor = levelIdx >= 0 ? LEVEL_COLORS[levelIdx] : '#6b7280';

          return (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span style={{ fontSize: 10, opacity: 0.6, width: 36 }}>{IS_CHINESE ? labelCN : label}</span>
                <div style={{ fontSize: 10, fontWeight: 700, color: levelColor }}>
                  {levelIdx >= 0 ? LEVEL_LABELS[levelIdx] : (IS_CHINESE ? '未检测' : 'N/A')}
                </div>
                <span style={{ fontSize: 10, opacity: 0.5, width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {e1rm > 0 ? `${e1rm}kg` : '—'}
                  {nextKg ? ` → ${nextKg.toFixed(0)}` : ''}
                </span>
              </div>
              {e1rm > 0 && (
                <div className="flex gap-0.5">
                  {ratios.map((_, i) => {
                    const filled = i <= levelIdx;
                    return (
                      <div key={i} style={{
                        flex: 1, height: 5, borderRadius: 2,
                        background: filled ? LEVEL_COLORS[i] : 'rgba(128,128,128,0.15)',
                        opacity: filled ? 1 : 0.5,
                      }} />
                    );
                  })}
                </div>
              )}
              {nextKg && levelIdx >= 0 && (
                <div className="mt-0.5 rounded-full overflow-hidden" style={{ height: 2, background: 'rgba(128,128,128,0.1)' }}>
                  <div style={{ width: `${progress * 100}%`, height: '100%', background: LEVEL_COLORS[nextIdx] ?? '#fff', borderRadius: 9999, transition: 'width 0.6s ease' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
