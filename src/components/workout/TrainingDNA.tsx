import { useMemo } from 'react';
import type { WorkoutSession } from '@/types/workout';
import { getExerciseMuscles } from '@/utils/workoutMuscles';
import { IS_CHINESE } from './WorkoutUI';

// Color per dominant muscle group
const MUSCLE_COLOR: Record<string, string> = {
  chest:      '#6366f1',
  back:       '#8b5cf6',
  shoulders:  '#3b82f6',
  biceps:     '#14b8a6',
  triceps:    '#10b981',
  quads:      '#f59e0b',
  hamstrings: '#f97316',
  glutes:     '#ec4899',
  abs:        '#06b6d4',
  calves:     '#84cc16',
};
const DEFAULT_COLOR = 'rgba(128,128,128,0.4)';

function getDominantMuscle(w: WorkoutSession): string {
  const muscleVol: Record<string, number> = {};
  w.exercises.forEach((ex) => {
    const muscles = getExerciseMuscles(ex.name);
    let vol = 0;
    ex.sets.forEach((s) => {
      if (['normal', 'dropset', 'failure'].includes(s.type) && s.weight_kg && s.reps)
        vol += s.weight_kg * s.reps;
    });
    muscles.forEach((m) => { muscleVol[m] = (muscleVol[m] ?? 0) + vol; });
  });
  const top = Object.entries(muscleVol).sort(([, a], [, b]) => b - a)[0];
  return top ? top[0] : '';
}

const SVG_SIZE = 300;
const CX = SVG_SIZE / 2, CY = SVG_SIZE / 2;
const DAYS_PER_RING = 91; // ~1 quarter per ring
const MAX_RINGS = 8;
const R_INNER = 24;
const RING_W = 13;
const SEG_GAP = 0.8; // degrees

function polarArc(angleDeg: number, r: number, arcDeg: number, radialH: number): string {
  const startRad = ((angleDeg - SEG_GAP / 2) * Math.PI) / 180;
  const endRad   = ((angleDeg + arcDeg - SEG_GAP / 2) * Math.PI) / 180;
  const rOuter = r + radialH;
  const x1 = CX + r * Math.cos(startRad);
  const y1 = CY + r * Math.sin(startRad);
  const x2 = CX + r * Math.cos(endRad);
  const y2 = CY + r * Math.sin(endRad);
  const x3 = CX + rOuter * Math.cos(endRad);
  const y3 = CY + rOuter * Math.sin(endRad);
  const x4 = CX + rOuter * Math.cos(startRad);
  const y4 = CY + rOuter * Math.sin(startRad);
  const large = arcDeg > 180 ? 1 : 0;
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${r.toFixed(2)} ${r.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${rOuter.toFixed(2)} ${rOuter.toFixed(2)} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ');
}

export default function TrainingDNA({ workouts }: { workouts: WorkoutSession[] }) {
  const segments = useMemo(() => {
    if (workouts.length === 0) return [];
    const sorted = [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time));

    // Build date→session map
    const dayMap: Record<string, { vol: number; muscle: string }[]> = {};
    sorted.forEach((w) => {
      const d = w.start_time.slice(0, 10);
      if (!dayMap[d]) dayMap[d] = [];
      dayMap[d].push({ vol: w.total_volume_kg, muscle: getDominantMuscle(w) });
    });

    const maxVol = Math.max(...sorted.map((w) => w.total_volume_kg), 1);

    // Generate rings from newest → oldest, each ring = DAYS_PER_RING days
    const today = new Date();
    const segs: Array<{ d: string; color: string; radialH: number; angleDeg: number; ringIdx: number }> = [];

    for (let ring = 0; ring < MAX_RINGS; ring++) {
      const ringStartDayAgo = ring * DAYS_PER_RING;
      const r = R_INNER + ring * RING_W;
      const degPerDay = 360 / DAYS_PER_RING;

      for (let di = 0; di < DAYS_PER_RING; di++) {
        const daysAgo = ringStartDayAgo + di;
        const d = new Date(today); d.setDate(d.getDate() - daysAgo);
        const dateStr = d.toISOString().slice(0, 10);
        const sessions = dayMap[dateStr];
        if (!sessions || sessions.length === 0) continue;

        const totalVol = sessions.reduce((s, x) => s + x.vol, 0);
        const topMuscle = sessions.sort((a, b) => b.vol - a.vol)[0].muscle;
        const ratio = Math.min(totalVol / maxVol, 1);
        const radialH = 2 + ratio * (RING_W - 4);
        const color = MUSCLE_COLOR[topMuscle] ?? DEFAULT_COLOR;
        // angle: di=0 → top (-90°), increases clockwise
        const angleDeg = -90 + di * degPerDay;
        segs.push({ d: dateStr, color, radialH, angleDeg, ringIdx: ring });
      }
    }
    return segs;
  }, [workouts]);

  const muscleColors = Object.entries(MUSCLE_COLOR).slice(0, 8);

  const MUSCLE_CN: Record<string, string> = {
    chest: '胸', back: '背', shoulders: '肩', biceps: '二头', triceps: '三头',
    quads: '腿', hamstrings: '腘', glutes: '臀', abs: '核心',
  };

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.1em] opacity-40 mb-1">
        {IS_CHINESE ? '训练 DNA 指纹' : 'Training DNA'}
      </div>
      <div style={{ fontSize: 9, opacity: 0.28, marginBottom: 8 }}>
        {IS_CHINESE
          ? '每圈 = 约3个月训练历史 · 颜色 = 主导肌群 · 高度 = 训练强度'
          : 'Each ring ≈ 3mo · Color = dominant muscle · Height = intensity'}
      </div>

      <div className="flex flex-col items-center">
        <svg width={SVG_SIZE} height={SVG_SIZE} viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}>
          {/* Ring guides */}
          {Array.from({ length: MAX_RINGS }, (_, i) => (
            <circle key={i} cx={CX} cy={CY} r={R_INNER + i * RING_W}
              fill="none" stroke="rgba(128,128,128,0.06)" strokeWidth={1} />
          ))}
          {/* Segments */}
          {segments.map(({ d, color, radialH, angleDeg, ringIdx }) => (
            <path key={`${d}-${ringIdx}`}
              d={polarArc(angleDeg, R_INNER + ringIdx * RING_W + (RING_W - radialH) / 2, 360 / DAYS_PER_RING, radialH)}
              fill={color}
              opacity={0.85}
              style={{ filter: `drop-shadow(0 0 2px ${color}44)` }}
            >
              <title>{d}</title>
            </path>
          ))}
          {/* Center label */}
          <text x={CX} y={CY} textAnchor="middle" dominantBaseline="middle"
            fill="currentColor" fontSize={9} opacity={0.3} style={{ userSelect: 'none' }}>
            {IS_CHINESE ? '训练DNA' : 'DNA'}
          </text>
          {/* Ring year labels */}
          {Array.from({ length: Math.min(MAX_RINGS, 4) }, (_, i) => {
            const daysAgo = i * DAYS_PER_RING + DAYS_PER_RING / 2;
            const d = new Date(Date.now() - daysAgo * 86400000);
            const label = `${d.getFullYear()}Q${Math.ceil((d.getMonth() + 1) / 3)}`;
            const r = R_INNER + i * RING_W + RING_W / 2;
            return (
              <text key={i} x={CX + r} y={CY} textAnchor="start" dominantBaseline="middle"
                fill="currentColor" fontSize={7} opacity={0.2} style={{ userSelect: 'none' }}>
                {label}
              </text>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
          {muscleColors.map(([muscle, color]) => (
            <div key={muscle} className="flex items-center gap-1">
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <span style={{ fontSize: 8, opacity: 0.4 }}>
                {IS_CHINESE ? (MUSCLE_CN[muscle] ?? muscle) : muscle}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
