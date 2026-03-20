import { useState, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  BarChart, Bar, LineChart, Line, ComposedChart,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import Layout from '@/components/Layout';
import useWorkouts, { formatDuration } from '@/hooks/useWorkouts';
import WorkoutCalendar from '@/components/WorkoutCalendar';
import WorkoutTable from '@/components/WorkoutTable';
import { useTheme } from '@/hooks/useTheme';
import type { WorkoutSession } from '@/types/workout';
import { translateExercise } from '@/utils/exerciseTranslations';
import {
  MUSCLE_LABELS_CN,
  getExerciseMuscles,
} from '@/utils/workoutMuscles';
import {
  calcE1RM,
  calcStreak,
  calcBestLifts,
  buildExerciseHistory,
  calcSessionScores,
  calcStagnation,
  calcProgressiveOverload,
  buildPRTimeline,
} from '@/utils/workoutCalcs';
import {
  IS_CHINESE,
  TOOLTIP_STYLE,
  SectionHeader,
  Card,
  PanelLabel,
} from '@/components/workout/WorkoutUI';
import NeonPRWall from '@/components/workout/NeonPRWall';
import AchievementsPanel from '@/components/workout/AchievementsPanel';
import MuscleHexPanel from '@/components/workout/MuscleHexPanel';
import MuscleDistributionPanel from '@/components/workout/MuscleDistributionPanel';
import TrainingHeartbeat from '@/components/workout/TrainingHeartbeat';
import MuscleRecovery from '@/components/workout/MuscleRecovery';
import E1RMCompare from '@/components/workout/E1RMCompare';
import TrainingLoad from '@/components/workout/TrainingLoad';
import ComparisonPanel from '@/components/workout/ComparisonPanel';
import HighlightReel from '@/components/workout/HighlightReel';

// =============================================================================
// CHART COMPONENTS
// =============================================================================

// Recent 30-day activity strip
const Recent30DayStrip = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const days = useMemo(() => {
    const trainedDates = new Set(workouts.map((w) => w.start_time.slice(0, 10)));
    return Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 86400000);
      const dateStr = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
      return { dateStr, isToday: i === 29, trained: trainedDates.has(dateStr), label: `${d.getMonth() + 1}/${d.getDate()}` };
    });
  }, [workouts]);
  const trainedCount = days.filter((d) => d.trained).length;
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <PanelLabel>{IS_CHINESE ? '近 30 天' : 'Last 30 Days'}</PanelLabel>
        <span className="text-xs opacity-50 tabular-nums">{trainedCount}/30</span>
      </div>
      <div className="flex gap-[3px]">
        {days.map(({ dateStr, isToday, trained }) => (
          <div key={dateStr} title={dateStr} style={{
            flex: 1, height: 10, borderRadius: 2,
            background: trained ? 'var(--wc-l3)' : 'var(--wc-empty)',
            outline: isToday ? '2px solid var(--wc-l4)' : 'none',
            outlineOffset: 1,
          }} />
        ))}
      </div>
      <div className="flex justify-between text-xs opacity-25 mt-1">
        <span>{days[0].label}</span>
        <span>{IS_CHINESE ? '今天' : 'Today'}</span>
      </div>
    </div>
  );
};

// Weekly volume + sets (2-col)
const VolumeAndSetsChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const data = useMemo(() => {
    const weeks: Record<string, { volume: number; sets: number }> = {};
    workouts.forEach((w) => {
      const d = new Date(w.start_time);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
      const key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      if (!weeks[key]) weeks[key] = { volume: 0, sets: 0 };
      weeks[key].volume += w.total_volume_kg;
      weeks[key].sets += w.total_sets;
    });
    return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b))
      .map(([week, { volume, sets }]) => ({ week: week.slice(5), volume: Math.round(volume), sets }));
  }, [workouts]);
  if (data.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <PanelLabel>{IS_CHINESE ? '每周总出力' : 'Weekly Volume'}</PanelLabel>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={data} margin={{ top: 2, right: 2, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="week" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toLocaleString()} kg`, IS_CHINESE ? '出力' : 'Volume']} />
            <Bar dataKey="volume" fill="var(--wc-l3)" opacity={0.9} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <PanelLabel>{IS_CHINESE ? '每周组数' : 'Weekly Sets'}</PanelLabel>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={data} margin={{ top: 2, right: 2, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="week" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, IS_CHINESE ? '组' : 'Sets']} />
            <Bar dataKey="sets" fill="var(--wc-l2)" opacity={0.9} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Volume per session + intensity (2-col)
const SessionTrendsChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const data = useMemo(() => (
    [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time))
      .filter((w) => w.total_volume_kg > 0 && w.duration_seconds > 0)
      .map((w) => ({
        date: w.start_time.slice(5, 10),
        volume: Math.round(w.total_volume_kg),
        intensity: Math.round(w.total_volume_kg / (w.duration_seconds / 60)),
      }))
  ), [workouts]);
  if (data.length < 3) return null;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <PanelLabel>{IS_CHINESE ? '单次出力' : 'Vol / Session'}</PanelLabel>
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toLocaleString()} kg`, '']} />
            <Line type="monotone" dataKey="volume" stroke="var(--wc-l3)" strokeWidth={1.5} dot={{ r: 2, fill: 'var(--wc-l3)', stroke: 'none' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div>
        <PanelLabel>{IS_CHINESE ? '训练效率 kg/min' : 'Intensity'}</PanelLabel>
        <ResponsiveContainer width="100%" height={100}>
          <LineChart data={data} margin={{ top: 4, right: 4, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} kg/min`, '']} />
            <Line type="monotone" dataKey="intensity" stroke="var(--wc-l4)" strokeWidth={1.5} dot={{ r: 2, fill: 'var(--wc-l4)', stroke: 'none' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Monthly frequency
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MonthlyFrequencyChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const data = useMemo(() => {
    const months: Record<string, number> = {};
    workouts.forEach((w) => { const k = w.start_time.slice(0, 7); months[k] = (months[k] || 0) + 1; });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ label: MONTH_SHORT[parseInt(key.slice(5, 7), 10) - 1], count }));
  }, [workouts]);
  if (data.length === 0) return null;
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '月度频率' : 'Monthly Frequency'}</PanelLabel>
      <ResponsiveContainer width="100%" height={88}>
        <BarChart data={data} margin={{ top: 0, right: 2, left: -22, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.35 }} />
          <YAxis tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.35 }} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, IS_CHINESE ? '次' : 'Sessions']} />
          <Bar dataKey="count" fill="var(--wc-l3)" opacity={0.9} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Weekday + time of day (2-col)
const WEEKDAY_LABELS = IS_CHINESE
  ? ['周一','周二','周三','周四','周五','周六','周日']
  : ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const TIME_BUCKET_LABELS = IS_CHINESE
  ? ['早晨','上午','午间','下午','晚间','深夜']
  : ['Dawn','Morn','Noon','Aftn','Eve','Night'];
const getTimeBucket = (h: number) =>
  h < 9 ? 0 : h < 12 ? 1 : h < 15 ? 2 : h < 18 ? 3 : h < 22 ? 4 : 5;

const TimeDistributionCharts = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const { weekData, timeData } = useMemo(() => {
    const wCounts = Array(7).fill(0);
    const tCounts = Array(6).fill(0);
    const tEffSums = Array(6).fill(0);
    workouts.forEach((w) => {
      wCounts[(new Date(w.start_time).getDay() + 6) % 7]++;
      const bucket = getTimeBucket(new Date(w.start_time).getHours());
      tCounts[bucket]++;
      if (w.total_volume_kg > 0 && w.duration_seconds > 0)
        tEffSums[bucket] += w.total_volume_kg / (w.duration_seconds / 60);
    });
    return {
      weekData: WEEKDAY_LABELS.map((label, i) => ({ label, count: wCounts[i] })),
      timeData: TIME_BUCKET_LABELS.map((label, i) => ({
        label, count: tCounts[i],
        avgEff: tCounts[i] > 0 ? Math.round(tEffSums[i] / tCounts[i]) : 0,
      })),
    };
  }, [workouts]);
  if (workouts.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <PanelLabel>{IS_CHINESE ? '星期分布' : 'Weekday'}</PanelLabel>
        <ResponsiveContainer width="100%" height={100}>
          <BarChart data={weekData} margin={{ top: 2, right: 2, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} />
            <YAxis tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, IS_CHINESE ? '次' : 'Sessions']} />
            <Bar dataKey="count" fill="var(--wc-l3)" opacity={0.9} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <PanelLabel>{IS_CHINESE ? '时段偏好' : 'Time of Day'}</PanelLabel>
        <ResponsiveContainer width="100%" height={100}>
          <ComposedChart data={timeData} margin={{ top: 4, right: 18, left: -26, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
            <XAxis dataKey="label" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} />
            <YAxis yAxisId="l" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} allowDecimals={false} />
            <YAxis yAxisId="r" orientation="right" tick={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE}
              formatter={(v: number, name: string) => [
                name === 'count' ? `${v}` : `${v} kg/min`,
                name === 'count' ? (IS_CHINESE ? '次数' : 'Count') : (IS_CHINESE ? '效率' : 'Intensity'),
              ]}
            />
            <Bar yAxisId="l" dataKey="count" fill="var(--wc-l2)" opacity={0.9} radius={[2, 2, 0, 0]} />
            <Line yAxisId="r" type="monotone" dataKey="avgEff" stroke="var(--wc-l4)" strokeWidth={1.5} dot={{ r: 3, fill: 'var(--wc-l4)', stroke: 'none' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Workout type distribution
const WORKOUT_TYPE_RULES: Array<{ key: string; patterns: string[] }> = [
  { key: IS_CHINESE ? '腿部' : 'Legs',     patterns: ['腿'] },
  { key: IS_CHINESE ? '背部' : 'Back',      patterns: ['背'] },
  { key: IS_CHINESE ? '胸部' : 'Chest',     patterns: ['胸','chest'] },
  { key: IS_CHINESE ? '肩部' : 'Shoulders', patterns: ['肩','shoulder'] },
  { key: IS_CHINESE ? '手臂' : 'Arms',      patterns: ['手臂','二头','三头','肱','arm','bicep','tricep'] },
  { key: IS_CHINESE ? '腹部' : 'Core',      patterns: ['腹','abs','core'] },
  { key: IS_CHINESE ? '臀部' : 'Glutes',    patterns: ['臀','glute'] },
  { key: IS_CHINESE ? '全身' : 'Full Body', patterns: ['全身','full body'] },
];
const detectWorkoutType = (title: string): string => {
  const lower = title.toLowerCase();
  const matched: string[] = [];
  for (const rule of WORKOUT_TYPE_RULES) {
    if (rule.patterns.some((p) => lower.includes(p) || title.includes(p))) matched.push(rule.key);
  }
  if (matched.length === 0) return IS_CHINESE ? '其他' : 'Other';
  return matched.slice(0, 2).join('+');
};
const WorkoutTypeChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const data = useMemo(() => {
    const freq: Record<string, number> = {};
    workouts.forEach((w) => { const t = detectWorkoutType(w.title); freq[t] = (freq[t] || 0) + 1; });
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  }, [workouts]);
  const otherKey = IS_CHINESE ? '其他' : 'Other';
  if (data.filter((d) => d.label !== otherKey).length === 0) return null;
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '训练类型' : 'Workout Types'}</PanelLabel>
      <ResponsiveContainer width="100%" height={Math.max(80, Math.min(data.length * 22, 150))}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 20, left: 40, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.35 }} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.6 }} width={40} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [v, IS_CHINESE ? '次' : 'Sessions']} />
          <Bar dataKey="count" fill="var(--wc-l3)" opacity={0.9} radius={[0, 2, 2, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// Muscle volume distribution (horizontal bar)
const MuscleVolumeChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const data = useMemo(() => {
    const vol: Record<string, number> = {};
    workouts.forEach((w) => {
      w.exercises.forEach((ex) => {
        if (['warm up', 'warmup'].includes(ex.name.toLowerCase())) return;
        const muscles = getExerciseMuscles(ex.name);
        if (!muscles.length) return;
        const sets = ex.sets.filter((s) => ['normal', 'dropset', 'failure'].includes(s.type));
        const v = sets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
        const contrib = v > 0 ? v : sets.length * 50;
        muscles.forEach((m) => { vol[m] = (vol[m] || 0) + contrib; });
      });
    });
    return Object.entries(vol)
      .map(([muscle, volume]) => ({
        muscle,
        label: IS_CHINESE ? (MUSCLE_LABELS_CN[muscle] ?? muscle) : muscle,
        volume: Math.round(volume / 100) / 10,
      }))
      .sort((a, b) => b.volume - a.volume)
      .slice(0, 9);
  }, [workouts]);
  if (data.length === 0) return null;
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '肌群训练量 (百 kg)' : 'Volume by Muscle (×100 kg)'}</PanelLabel>
      <ResponsiveContainer width="100%" height={Math.max(100, data.length * 23)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: 36, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.4 }} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: 'currentColor', opacity: 0.7 }} width={40} />
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v: number) => [`${v} × 100 kg`, IS_CHINESE ? '训练量' : 'Volume']} />
          <Bar dataKey="volume" fill="var(--wc-l3)" opacity={0.9} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// =============================================================================
// PANEL COMPONENTS
// =============================================================================

// Weekly goal — SVG ring
const WeeklyGoalWidget = ({ workouts, goal }: { workouts: WorkoutSession[]; goal: number }) => {
  const count = useMemo(() => {
    const now = new Date();
    const dayOfWeek = (now.getDay() + 6) % 7;
    const monday = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek);
    monday.setHours(0, 0, 0, 0);
    const mondayStr = monday.toISOString().slice(0, 10);
    const sundayStr = new Date(monday.getTime() + 6 * 86400000).toISOString().slice(0, 10);
    return workouts.filter((w) => { const d = w.start_time.slice(0, 10); return d >= mondayStr && d <= sundayStr; }).length;
  }, [workouts]);
  const done = count >= goal;
  const r = 20, circ = 2 * Math.PI * r, offset = circ * (1 - Math.min(count / goal, 1));
  return (
    <div className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{ background: 'var(--wo-card-bg)', border: '1px solid var(--wo-card-border)' }}>
      <svg width={48} height={48} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
        <circle cx="24" cy="24" r={r} fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth="3.5" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={done ? 'var(--wc-l4)' : 'var(--wc-l3)'}
          strokeWidth="3.5" strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 24 24)"
          style={done ? { filter: 'drop-shadow(0 0 4px var(--wc-l4)) drop-shadow(0 0 8px var(--wc-l3))', animation: 'neonPulse 2s ease-in-out infinite' } : {}} />
        <text x="24" y="24" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="bold" fill="currentColor">
          {count}/{goal}
        </text>
      </svg>
      <div>
        <div className="text-sm font-semibold leading-tight">{IS_CHINESE ? '本周目标' : 'Weekly Goal'}</div>
        <div className="text-xs mt-0.5" style={{ color: done ? 'var(--wc-l4)' : undefined, opacity: done ? 1 : 0.45 }}>
          {done ? (IS_CHINESE ? '🎉 已完成！' : '🎉 Done!') : (IS_CHINESE ? `还差 ${goal - count} 次` : `${goal - count} to go`)}
        </div>
      </div>
    </div>
  );
};

// Rep range panel
const RepRangePanel = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const { strength, hypertrophy, endurance, total } = useMemo(() => {
    let strength = 0, hypertrophy = 0, endurance = 0;
    workouts.forEach((w) => {
      w.exercises.forEach((ex) => {
        if (['warm up', 'warmup'].includes(ex.name.toLowerCase())) return;
        ex.sets.forEach((s) => {
          if (!['normal', 'dropset', 'failure'].includes(s.type) || s.reps === undefined) return;
          if (s.reps <= 5) strength++;
          else if (s.reps <= 12) hypertrophy++;
          else endurance++;
        });
      });
    });
    return { strength, hypertrophy, endurance, total: strength + hypertrophy + endurance };
  }, [workouts]);
  if (total === 0) return null;
  const pct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;
  const ranges = [
    { label: IS_CHINESE ? '力量 (1–5)' : 'Strength (1–5)',       count: strength,    color: 'var(--wc-l4)' },
    { label: IS_CHINESE ? '增肌 (6–12)' : 'Hypertrophy (6–12)', count: hypertrophy, color: 'var(--wc-l3)' },
    { label: IS_CHINESE ? '耐力 (13+)' : 'Endurance (13+)',      count: endurance,   color: 'var(--wc-l2)' },
  ];
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '组次强度分布' : 'Rep Range'}</PanelLabel>
      <div className="flex rounded-md overflow-hidden h-2.5 mb-3">
        {ranges.map(({ label, count, color }) => count > 0
          ? <div key={label} style={{ width: `${pct(count)}%`, background: color }} title={`${label}: ${count} (${pct(count)}%)`} />
          : null)}
      </div>
      <div className="space-y-1.5">
        {ranges.map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: color, display: 'inline-block' }} />
            <span className="flex-1 opacity-65">{label}</span>
            <span className="tabular-nums opacity-45">{count} sets</span>
            <span className="tabular-nums opacity-35 w-7 text-right">{pct(count)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Milestone records
const MilestoneCards = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const cards = useMemo(() => {
    if (workouts.length === 0) return [];
    const withVol = workouts.filter((w) => w.total_volume_kg > 0);
    const maxVol = withVol.length ? withVol.reduce((a, b) => a.total_volume_kg > b.total_volume_kg ? a : b) : null;
    const maxDur = workouts.reduce((a, b) => a.duration_seconds > b.duration_seconds ? a : b);
    const maxSets = workouts.reduce((a, b) => a.total_sets > b.total_sets ? a : b);
    const effList = workouts.filter((w) => w.total_volume_kg > 0 && w.duration_seconds > 0);
    const maxEff = effList.length ? effList.reduce((a, b) =>
      a.total_volume_kg / a.duration_seconds > b.total_volume_kg / b.duration_seconds ? a : b) : null;
    return [
      maxVol && { icon: '🏋️', label: IS_CHINESE ? '最高单次出力' : 'Max Volume', value: `${(maxVol.total_volume_kg / 1000).toFixed(1)}t`, sub: maxVol.start_time.slice(0, 10) },
      { icon: '⏱', label: IS_CHINESE ? '最长训练' : 'Longest', value: formatDuration(maxDur.duration_seconds), sub: maxDur.start_time.slice(0, 10) },
      { icon: '📦', label: IS_CHINESE ? '最多组数' : 'Most Sets', value: `${maxSets.total_sets}`, sub: maxSets.start_time.slice(0, 10) },
      maxEff && { icon: '⚡', label: IS_CHINESE ? '最高效率' : 'Best Intensity', value: `${Math.round(maxEff.total_volume_kg / (maxEff.duration_seconds / 60))} kg/m`, sub: maxEff.start_time.slice(0, 10) },
    ].filter(Boolean) as Array<{ icon: string; label: string; value: string; sub: string }>;
  }, [workouts]);
  if (cards.length === 0) return null;
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '个人纪录' : 'Records'}</PanelLabel>
      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => (
          <div key={c.label} className="rounded-lg p-3"
            style={{ background: 'var(--wt-chip-bg)', border: '1px solid var(--wo-card-border)' }}>
            <div className="text-base leading-none mb-1">{c.icon}</div>
            <div className="text-xs opacity-40 leading-tight">{c.label}</div>
            <div className="text-sm font-bold mt-0.5 tabular-nums">{c.value}</div>
            <div className="text-xs opacity-25 mt-0.5">{c.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Top sessions by score
const TopSessionsPanel = ({ workouts, scoreMap }: { workouts: WorkoutSession[]; scoreMap: Record<string, number> }) => {
  const top = useMemo(() =>
    [...workouts].filter((w) => scoreMap[w.id] !== undefined)
      .sort((a, b) => (scoreMap[b.id] || 0) - (scoreMap[a.id] || 0))
      .slice(0, 5)
  , [workouts, scoreMap]);
  if (top.length === 0) return null;
  const maxScore = scoreMap[top[0].id] || 1;
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '最强训练 TOP 5' : 'Best Sessions'}</PanelLabel>
      <div className="space-y-2.5">
        {top.map((w, i) => {
          const score = scoreMap[w.id] || 0;
          return (
            <div key={w.id} className="text-xs">
              <div className="flex items-center gap-2 mb-1">
                <span className="opacity-25 w-4 shrink-0 tabular-nums">#{i + 1}</span>
                <span className="flex-1 opacity-70 truncate">{w.title}</span>
                <span className="opacity-35 whitespace-nowrap">{w.start_time.slice(5, 10)}</span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--wc-l4)' }}>{score}</span>
              </div>
              <div className="ml-6 h-1 rounded-full" style={{ background: 'var(--wt-chip-bg)' }}>
                <div className="h-full rounded-full" style={{ width: `${(score / maxScore) * 100}%`, background: 'var(--wc-l3)' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Stagnation alerts
const StagnationPanel = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const alerts = useMemo(() => calcStagnation(workouts, 3), [workouts]);
  if (alerts.length === 0) return null;
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '停滞预警' : 'Stagnation Alerts'}</PanelLabel>
      <div className="space-y-1.5">
        {alerts.slice(0, 5).map(({ name, sessionsSincePR, bestE1rm, lastPRDate }) => (
          <div key={name} className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
            style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)' }}>
            <span className="flex-1 opacity-80 truncate font-medium">{translateExercise(name)}</span>
            <div className="text-right shrink-0">
              <div style={{ color: 'rgba(239,68,68,0.9)' }} className="font-semibold">
                {IS_CHINESE ? `${sessionsSincePR} 次未突破` : `${sessionsSincePR}x no PR`}
              </div>
              <div className="opacity-35">e1RM {bestE1rm} kg · {lastPRDate}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Progressive overload
const ProgressiveOverloadPanel = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const overloads = useMemo(() => calcProgressiveOverload(workouts), [workouts]);
  if (overloads.length === 0) return null;
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '渐进超负荷' : 'Progressive Overload'}</PanelLabel>
      <div className="space-y-2">
        {overloads.slice(0, 8).map(({ name, firstE1rm, lastE1rm, pctChange, sessions }) => (
          <div key={name} className="flex items-center gap-2 text-xs">
            <span className="flex-1 opacity-75 truncate">{translateExercise(name)}</span>
            <span className="opacity-35 tabular-nums whitespace-nowrap">{firstE1rm}→{lastE1rm} kg</span>
            <span className="font-semibold tabular-nums whitespace-nowrap w-10 text-right"
              style={{ color: pctChange > 0 ? 'var(--wc-l4)' : 'rgba(239,68,68,0.85)' }}>
              {pctChange > 0 ? '+' : ''}{pctChange}%
            </span>
            <span className="opacity-25 tabular-nums w-6 text-right">{sessions}x</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Recovery rhythm
const RecoveryRhythm = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const { avgGap, currentGap, pattern } = useMemo(() => {
    const dates = [...new Set(workouts.map((w) => w.start_time.slice(0, 10)))].sort();
    if (dates.length < 2) return { avgGap: 0, currentGap: 0, pattern: '' };
    const gaps = dates.slice(1).map((d, i) =>
      (new Date(d).getTime() - new Date(dates[i]).getTime()) / 86400000
    );
    const avgGap = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length * 10) / 10;
    const currentGap = Math.floor((Date.now() - new Date(dates[dates.length - 1]).getTime()) / 86400000);
    const gapCounts: Record<number, number> = {};
    gaps.forEach((g) => { const r = Math.round(g); gapCounts[r] = (gapCounts[r] || 0) + 1; });
    const mostCommon = Number(Object.entries(gapCounts).sort((a, b) => Number(b[1]) - Number(a[1]))[0][0]);
    const pattern = mostCommon === 1
      ? (IS_CHINESE ? '连续型' : 'Consecutive')
      : mostCommon === 2
        ? (IS_CHINESE ? '隔天型' : 'Every 2d')
        : (IS_CHINESE ? `每 ${mostCommon} 天` : `Every ${mostCommon}d`);
    return { avgGap, currentGap, pattern };
  }, [workouts]);
  if (avgGap === 0) return null;
  return (
    <div>
      <PanelLabel>{IS_CHINESE ? '训练节律' : 'Recovery Rhythm'}</PanelLabel>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { val: `${avgGap}d`, label: IS_CHINESE ? '平均间隔' : 'Avg Gap', warn: false },
          { val: `${currentGap}d`, label: IS_CHINESE ? '距上次' : 'Since Last', warn: currentGap > 4 },
          { val: pattern, label: IS_CHINESE ? '习惯节律' : 'Pattern', warn: false },
        ].map(({ val, label, warn }) => (
          <div key={label} className="rounded-lg py-2.5 px-1"
            style={{ background: 'var(--wt-chip-bg)', border: '1px solid var(--wo-card-border)' }}>
            <div className={`text-sm font-bold leading-tight ${warn ? 'text-orange-400' : ''}`}>{val}</div>
            <div className="text-xs opacity-35 mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 今日推介 — Next session guide (HK cha chaan teng board style)
// ─────────────────────────────────────────────────────────────────────────────
const MAJOR_MUSCLES = ['back', 'chest', 'quads', 'shoulders', 'biceps', 'triceps', 'hamstrings', 'glutes'] as const;

const NextSessionGuide = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const suggestions = useMemo(() => {
    const lastTrained: Record<string, string> = {};
    [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach((w) => {
      w.exercises.forEach((ex) => {
        getExerciseMuscles(ex.name).forEach((m) => { lastTrained[m] = w.start_time.slice(0, 10); });
      });
    });
    const todayMs = new Date().setHours(0, 0, 0, 0);
    return [...MAJOR_MUSCLES].map((m) => {
      const last = lastTrained[m];
      const days = last ? Math.floor((todayMs - new Date(last).setHours(0, 0, 0, 0)) / 86400000) : null;
      return { muscle: m, label: MUSCLE_LABELS_CN[m] ?? m, days };
    }).sort((a, b) => (b.days ?? 999) - (a.days ?? 999));
  }, [workouts]);

  // Status thresholds
  const status = (days: number | null) =>
    days === null      ? { text: '未記錄', color: '#ff4400', badge: '★★★' } :
    days >= 5          ? { text: `${days}d 已恢復`, color: '#ff6b00', badge: '★★★' } :
    days >= 3          ? { text: `${days}d 可訓練`, color: '#ffcc00', badge: '★★' } :
    days >= 1          ? { text: `${days}d 稍候`,   color: 'rgba(255,255,255,0.3)', badge: '·' } :
                         { text: '今天已練',          color: 'rgba(255,255,255,0.2)', badge: '·' };

  return (
    <div style={{
      background: 'linear-gradient(160deg, #110800 0%, #0a0400 60%, #0d0600 100%)',
      border: '1px solid rgba(200,130,10,0.3)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
    }}>
      {/* Shop-sign header band */}
      <div style={{
        background: 'linear-gradient(90deg, #8a5500, #c8860a, #f5a623, #c8860a, #8a5500)',
        padding: '7px 14px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Shimmer sweep on header */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, width: '40%', pointerEvents: 'none',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.22), transparent)',
          animation: 'shimmer 3.5s ease-in-out infinite',
        }} />
        <span style={{ fontSize: 15, fontWeight: 900, color: '#3d1a00', letterSpacing: '0.05em' }}>今日推介</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#3d1a00', letterSpacing: '0.25em', opacity: 0.8 }}>
          TODAY'S PICK
        </span>
      </div>

      {/* Items */}
      <div style={{ padding: '10px 16px 12px' }}>
        {suggestions.map(({ muscle, label, days }, i) => {
          const s = status(days);
          const isRested = days === null || days >= 3;
          return (
            <div key={muscle} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 0',
              borderBottom: i < suggestions.length - 1 ? '1px solid rgba(200,130,10,0.1)' : 'none',
              animation: `slideUp 0.3s ease ${i * 0.05}s both`,
              opacity: isRested ? 1 : 0.45,
            }}>
              <span style={{ fontSize: 13, color: s.color, width: 24, flexShrink: 0, textAlign: 'center', letterSpacing: '-0.05em' }}>
                {s.badge}
              </span>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'rgba(255,220,150,0.92)' }}>
                {label}
              </span>
              <span style={{ fontSize: 9, color: 'rgba(255,220,150,0.3)', letterSpacing: '0.04em' }}>
                {muscle.toUpperCase()}
              </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: s.color, textAlign: 'right', minWidth: 72 }}>
                {s.text}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid rgba(200,130,10,0.12)',
        padding: '6px 14px',
        fontSize: 9.5,
        color: 'rgba(200,130,10,0.4)',
        letterSpacing: '0.25em',
        textAlign: 'center',
      }}>
        ★ 基於肌肉恢復狀況推薦 · RECOVERY-BASED SUGGESTION ★
      </div>
    </div>
  );
};

// Best lifts — clickable
const BestLiftsPanel = ({
  workouts, selectedExercise, onSelectExercise,
}: { workouts: WorkoutSession[]; selectedExercise: string | null; onSelectExercise: (name: string) => void }) => {
  const lifts = useMemo(() => calcBestLifts(workouts, 8), [workouts]);
  if (lifts.length === 0) return null;
  return (
    <div>
      <PanelLabel>
        {IS_CHINESE ? '最佳 e1RM (点击看进步)' : 'Personal Bests (click)'}
      </PanelLabel>
      <div className="space-y-0.5">
        {lifts.map(({ name, weight, reps, e1rm, date }) => (
          <div key={name}
            className="flex items-center gap-2 text-sm cursor-pointer rounded-lg px-2 py-1.5 -mx-2 transition-all"
            style={selectedExercise === name
              ? { background: 'rgba(99,102,241,0.12)', borderRadius: 8 }
              : {}}
            onClick={() => onSelectExercise(name)}
          >
            <span className="flex-1 opacity-75 truncate text-xs">{translateExercise(name)}</span>
            <span className="text-xs opacity-35 tabular-nums whitespace-nowrap">{weight}×{reps}</span>
            <span className="text-xs font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--wt-pr-color)' }}>{e1rm} kg</span>
            <span className="text-xs opacity-20 tabular-nums">{date.slice(5)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 text-xs opacity-25">* Epley e1RM 估算</div>
    </div>
  );
};

// Exercise progress chart — dual line (e1RM + session vol)
const ExerciseProgress = ({ name, workouts, onClose }: { name: string; workouts: WorkoutSession[]; onClose: () => void }) => {
  const data = useMemo(() => {
    const pts: Array<{ date: string; e1rm: number; weight: number; reps: number; sessionVol: number }> = [];
    [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach((w) => {
      const ex = w.exercises.find((e) => e.name === name);
      if (!ex) return;
      let bestE1rm = 0, bestWeight = 0, bestReps = 0, sessionVol = 0;
      ex.sets.filter((s) => ['normal', 'dropset', 'failure'].includes(s.type)).forEach((s) => {
        if ((s.weight_kg ?? 0) > 0 && s.reps !== undefined) {
          sessionVol += s.weight_kg! * s.reps;
          const e1rm = calcE1RM(s.weight_kg!, s.reps);
          if (e1rm > bestE1rm) { bestE1rm = e1rm; bestWeight = s.weight_kg!; bestReps = s.reps; }
        }
      });
      if (bestE1rm > 0) pts.push({ date: w.start_time.slice(0, 10), e1rm: bestE1rm, weight: bestWeight, reps: bestReps, sessionVol: Math.round(sessionVol) });
    });
    return pts;
  }, [name, workouts]);

  const prDates = useMemo(() => {
    let best = 0; const prs = new Set<string>();
    data.forEach((d) => { if (d.e1rm > best) { best = d.e1rm; prs.add(d.date); } });
    return prs;
  }, [data]);

  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-sm truncate" style={{ color: 'var(--wc-l4)' }}>{translateExercise(name)}</span>
        <button onClick={onClose} className="ml-2 text-xs opacity-35 hover:opacity-70 shrink-0 transition-opacity">✕</button>
      </div>
      {data.length === 0 ? <div className="text-xs opacity-40">No weight data</div> : (
        <>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={data} margin={{ top: 4, right: 38, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.1)" />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.35 }} interval="preserveStartEnd" />
              <YAxis yAxisId="e" tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.35 }} unit="kg" />
              <YAxis yAxisId="v" orientation="right" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.25 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE}
                formatter={(v: number, name: string, props: any) => {
                  if (name === 'e1rm') return [`e1RM ${v} kg (${props.payload.weight}×${props.payload.reps})`, IS_CHINESE ? '估算最大' : 'Est. 1RM'];
                  return [`${v.toLocaleString()} kg`, IS_CHINESE ? '单次出力' : 'Session Vol'];
                }}
              />
              <Line yAxisId="e" type="monotone" dataKey="e1rm" stroke="var(--wc-l3)" strokeWidth={2}
                dot={(props: any) => {
                  const isPR = prDates.has(props.payload.date);
                  return <circle key={props.key} cx={props.cx} cy={props.cy} r={isPR ? 5 : 3}
                    fill={isPR ? 'var(--wt-pr-color)' : 'var(--wc-l3)'} stroke="none" />;
                }}
              />
              <Line yAxisId="v" type="monotone" dataKey="sessionVol" stroke="var(--wc-l2)" strokeWidth={1.5} strokeDasharray="4 2"
                dot={{ r: 2, fill: 'var(--wc-l2)', stroke: 'none' }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-2 flex items-center gap-4 text-xs opacity-45 flex-wrap">
            <span><span style={{ color: 'var(--wt-pr-color)' }}>●</span> e1RM PR</span>
            <span><span style={{ color: 'var(--wc-l2)' }}>– –</span> {IS_CHINESE ? '单次出力' : 'Session Vol'}</span>
            <span>{data.length} sessions</span>
          </div>
        </>
      )}
    </Card>
  );
};

// PR timeline
const PR_TIMELINE_INITIAL = 8;
const PRTimeline = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const events = useMemo(() => buildPRTimeline(workouts), [workouts]);
  const [expanded, setExpanded] = useState(false);
  if (events.length === 0) return null;
  const visible = expanded ? events : events.slice(0, PR_TIMELINE_INITIAL);
  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <PanelLabel style={{ marginBottom: 0 }}>{IS_CHINESE ? 'PR 成就时间线' : 'PR Timeline'}</PanelLabel>
        {events.length > PR_TIMELINE_INITIAL && (
          <button onClick={() => setExpanded((v) => !v)} style={{
            fontSize: 11, opacity: 0.45, background: 'none', border: 'none',
            cursor: 'pointer', color: 'inherit', padding: '2px 4px',
          }}>
            {expanded ? (IS_CHINESE ? '收起 ▲' : 'Collapse ▲') : `+${events.length - PR_TIMELINE_INITIAL} ▼`}
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {visible.map((e, i) => {
          const isFirst = e.prevE1rm === null;
          const pct = e.prevE1rm ? Math.round(((e.e1rm - e.prevE1rm) / e.prevE1rm) * 100) : null;
          return (
            <div key={i} className="flex items-start gap-3 text-xs">
              <span className="opacity-30 tabular-nums whitespace-nowrap pt-0.5 w-16 shrink-0">{e.date.slice(5)}</span>
              <div className="flex-1 min-w-0">
                <span className="opacity-80 block truncate font-medium">{translateExercise(e.exercise)}</span>
                <span className="opacity-35">{e.weight}×{e.reps} → {e.e1rm} kg</span>
              </div>
              <div className="shrink-0">
                {isFirst
                  ? <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.15)', color: 'var(--wc-l4)' }}>首次</span>
                  : pct !== null
                    ? <span style={{ color: 'var(--wt-pr-color)' }} className="font-semibold">+{pct}%</span>
                    : null}
              </div>
            </div>
          );
        })}
      </div>
      {events.length > PR_TIMELINE_INITIAL && (
        <button onClick={() => setExpanded((v) => !v)} style={{
          marginTop: 10, width: '100%', fontSize: 11, opacity: 0.35,
          background: 'none', border: 'none', cursor: 'pointer', color: 'inherit',
          padding: '4px 0',
        }}>
          {expanded
            ? (IS_CHINESE ? '收起 ▲' : 'Show less ▲')
            : (IS_CHINESE ? `显示全部 ${events.length} 条 ▼` : `Show all ${events.length} ▼`)}
        </button>
      )}
    </div>
  );
};

// Muscle body map
const MuscleBodyMap = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const volumes = useMemo(() => {
    const vol: Record<string, number> = {};
    workouts.forEach((w) => {
      w.exercises.forEach((ex) => {
        if (['warm up', 'warmup'].includes(ex.name.toLowerCase())) return;
        const muscles = getExerciseMuscles(ex.name);
        if (muscles.length === 0) return;
        const sets = ex.sets.filter((s) => ['normal', 'dropset', 'failure'].includes(s.type));
        const v = sets.reduce((sum, s) => sum + (s.weight_kg ?? 0) * (s.reps ?? 0), 0);
        const contribution = v > 0 ? v : sets.length * 50;
        muscles.forEach((m) => { vol[m] = (vol[m] || 0) + contribution; });
      });
    });
    return vol;
  }, [workouts]);
  const maxVol = useMemo(() => Math.max(1, ...Object.values(volumes)), [volumes]);

  const ratio = (muscle: string) => (volumes[muscle] || 0) / maxVol;

  // Smooth 5-stop heat color: inactive → dim → mid → bright → peak
  const mc = (muscle: string): string => {
    const r = ratio(muscle);
    if (r === 0) return 'rgba(100,100,130,0.1)';
    if (r < 0.15) return 'rgba(99,102,241,0.28)';
    if (r < 0.35) return 'rgba(99,102,241,0.52)';
    if (r < 0.6)  return 'rgba(129,140,248,0.75)';
    if (r < 0.82) return 'rgba(165,180,252,0.9)';
    return 'rgba(224,231,255,1)';
  };

  // Glow filter id suffix per side to avoid collision
  const BodySVG = ({ front }: { front: boolean }) => {
    const fid = front ? 'mmf' : 'mmb';
    const Muscle = ({ muscle, children }: { muscle: string; children: React.ReactNode }) => {
      const r = ratio(muscle);
      const label = IS_CHINESE ? (MUSCLE_LABELS_CN[muscle] ?? muscle) : muscle;
      const pct = Math.round(r * 100);
      return (
        <g filter={r > 0.55 ? `url(#${fid}-glow)` : undefined} opacity={r === 0 ? 0.35 : 1}>
          <title>{label} {pct > 0 ? `· ${pct}%` : '· 未训练'}</title>
          {children}
        </g>
      );
    };
    return (
      <svg viewBox="0 0 90 175" width="100%">
        <defs>
          <filter id={`${fid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {/* Body silhouette outline */}
        <ellipse cx="45" cy="11" rx="8" ry="9" fill="none" stroke="rgba(150,150,180,0.18)" strokeWidth="1" />
        <rect x="39" y="19" width="12" height="5" rx="2" fill="rgba(150,150,180,0.08)" />
        <path d="M29,24 C22,26 17,34 16,42 L14,66 C16,69 20,70 24,69 L24,97 C24,100 27,101 30,101 L60,101 C63,101 66,100 66,97 L66,69 C70,70 74,69 76,66 L74,42 C73,34 68,26 61,24 Z"
          fill="none" stroke="rgba(150,150,180,0.14)" strokeWidth="0.8" />
        {/* Leg outlines */}
        <path d="M30,101 L28,145 Q28,148 31,149 L38,149 Q41,148 41,145 L39,101 Z"
          fill="none" stroke="rgba(150,150,180,0.1)" strokeWidth="0.8" />
        <path d="M51,101 L49,145 Q49,148 52,149 L59,149 Q62,148 62,145 L60,101 Z"
          fill="none" stroke="rgba(150,150,180,0.1)" strokeWidth="0.8" />

        {/* Shoulders */}
        <Muscle muscle="shoulders">
          <ellipse cx="23" cy="29" rx="9" ry="6.5" fill={mc('shoulders')} />
          <ellipse cx="67" cy="29" rx="9" ry="6.5" fill={mc('shoulders')} />
        </Muscle>

        {front ? (<>
          {/* Chest — two pec shapes */}
          <Muscle muscle="chest">
            <path d="M30,24 Q45,31 60,24 L59,40 Q45,47 31,40 Z" fill={mc('chest')} />
          </Muscle>
          {/* Abs */}
          <Muscle muscle="abs">
            <rect x="34" y="43" width="22" height="26" rx="5" fill={mc('abs')} />
          </Muscle>
          {/* Biceps */}
          <Muscle muscle="biceps">
            <rect x="11" y="36" width="9" height="24" rx="4.5" fill={mc('biceps')} />
            <rect x="70" y="36" width="9" height="24" rx="4.5" fill={mc('biceps')} />
          </Muscle>
          {/* Forearms (inactive) */}
          <rect x="12" y="62" width="8" height="16" rx="4" fill="rgba(100,100,130,0.08)" />
          <rect x="70" y="62" width="8" height="16" rx="4" fill="rgba(100,100,130,0.08)" />
          {/* Quads */}
          <Muscle muscle="quads">
            <rect x="29" y="71" width="12" height="38" rx="6" fill={mc('quads')} />
            <rect x="49" y="71" width="12" height="38" rx="6" fill={mc('quads')} />
          </Muscle>
          {/* Calves */}
          <Muscle muscle="calves">
            <rect x="30" y="112" width="10" height="26" rx="5" fill={mc('calves')} />
            <rect x="50" y="112" width="10" height="26" rx="5" fill={mc('calves')} />
          </Muscle>
        </>) : (<>
          {/* Back — traps + lats */}
          <Muscle muscle="back">
            <path d="M30,24 Q45,29 60,24 L61,41 Q45,49 29,41 Z" fill={mc('back')} />
            <path d="M29,41 Q45,49 61,41 L59,63 Q45,68 31,63 Z" fill={mc('back')} opacity={0.78} />
          </Muscle>
          {/* Triceps */}
          <Muscle muscle="triceps">
            <rect x="11" y="36" width="9" height="24" rx="4.5" fill={mc('triceps')} />
            <rect x="70" y="36" width="9" height="24" rx="4.5" fill={mc('triceps')} />
          </Muscle>
          {/* Forearms (inactive) */}
          <rect x="12" y="62" width="8" height="16" rx="4" fill="rgba(100,100,130,0.08)" />
          <rect x="70" y="62" width="8" height="16" rx="4" fill="rgba(100,100,130,0.08)" />
          {/* Glutes */}
          <Muscle muscle="glutes">
            <ellipse cx="36" cy="72" rx="8" ry="7.5" fill={mc('glutes')} />
            <ellipse cx="54" cy="72" rx="8" ry="7.5" fill={mc('glutes')} />
          </Muscle>
          {/* Hamstrings */}
          <Muscle muscle="hamstrings">
            <rect x="29" y="80" width="13" height="32" rx="6" fill={mc('hamstrings')} />
            <rect x="48" y="80" width="13" height="32" rx="6" fill={mc('hamstrings')} />
          </Muscle>
          {/* Calves back */}
          <Muscle muscle="calves">
            <rect x="30" y="115" width="10" height="24" rx="5" fill={mc('calves')} />
            <rect x="50" y="115" width="10" height="24" rx="5" fill={mc('calves')} />
          </Muscle>
        </>)}
      </svg>
    );
  };

  const [showFront, setShowFront] = useState(true);
  const sorted = Object.entries(volumes).filter(([_, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <PanelLabel style={{ marginBottom: 0 }}>{IS_CHINESE ? '肌肉热力图' : 'Muscle Map'}</PanelLabel>
        <button
          onClick={() => setShowFront((f) => !f)}
          style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 9999,
            background: 'var(--wt-chip-bg)', border: '1px solid var(--wt-border)',
            cursor: 'pointer', color: 'inherit', opacity: 0.65,
            transition: 'opacity 0.15s',
          }}
        >
          {showFront ? (IS_CHINESE ? '切换背面 ↺' : 'Show Back ↺') : (IS_CHINESE ? '切换正面 ↺' : 'Show Front ↺')}
        </button>
      </div>

      {/* 3D flip card */}
      <div style={{ perspective: 700 }}>
        <div style={{
          transformStyle: 'preserve-3d',
          transform: showFront ? 'rotateY(0deg)' : 'rotateY(180deg)',
          transition: 'transform 0.55s cubic-bezier(0.4,0.2,0.2,1)',
          position: 'relative',
          minHeight: 180,
        }}>
          {/* Front face */}
          <div style={{ backfaceVisibility: 'hidden', position: 'absolute', width: '100%', top: 0 }}>
            <div className="text-center mb-1" style={{ fontSize: 10, opacity: 0.3 }}>{IS_CHINESE ? '正面' : 'Front'}</div>
            <div style={{ maxWidth: 140, margin: '0 auto' }}><BodySVG front={true} /></div>
          </div>
          {/* Back face */}
          <div style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', position: 'absolute', width: '100%', top: 0 }}>
            <div className="text-center mb-1" style={{ fontSize: 10, opacity: 0.3 }}>{IS_CHINESE ? '背面' : 'Back'}</div>
            <div style={{ maxWidth: 140, margin: '0 auto' }}><BodySVG front={false} /></div>
          </div>
          {/* Spacer to maintain height */}
          <div style={{ visibility: 'hidden', maxWidth: 140, margin: '0 auto' }}><BodySVG front={true} /></div>
        </div>
      </div>

      {/* Gradient legend bar */}
      <div className="flex items-center gap-2 mt-3 mb-2.5">
        <span style={{ fontSize: 10, opacity: 0.3 }}>{IS_CHINESE ? '少' : 'Low'}</span>
        <div className="flex-1 h-2 rounded-full" style={{
          background: 'linear-gradient(90deg, rgba(99,102,241,0.28), rgba(99,102,241,0.52), rgba(129,140,248,0.75), rgba(165,180,252,0.9), rgba(224,231,255,1))',
        }} />
        <span style={{ fontSize: 10, opacity: 0.3 }}>{IS_CHINESE ? '多' : 'High'}</span>
      </div>

      {/* Ranked muscle list with percentage */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {sorted.map(([muscle], i) => {
          const r = ratio(muscle);
          const pct = Math.round(r * 100);
          return (
            <div key={muscle} className="flex items-center gap-1.5" style={{ fontSize: 11 }}>
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: mc(muscle), display: 'inline-block' }} />
              <span style={{ opacity: 0.45 + (1 - i / sorted.length) * 0.4 }}>
                {IS_CHINESE ? (MUSCLE_LABELS_CN[muscle] ?? muscle) : muscle}
              </span>
              <span style={{ opacity: 0.3, fontSize: 10, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// =============================================================================
// STAT CARD — hero stats row
// =============================================================================
const HeroStat = ({ label, value, unit, accent, trend }: {
  label: string; value: string; unit?: string; accent?: boolean; trend?: number;
}) => (
  <div className="flex flex-col rounded-xl px-4 py-3 min-w-[88px]"
    style={{
      background: 'var(--wo-card-bg)',
      border: '1px solid var(--wo-card-border)',
      animation: 'countUp 0.4s ease both',
      transition: 'box-shadow 0.2s ease, border-color 0.2s ease',
    }}
    onMouseEnter={(e) => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(99,102,241,0.12)';
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--wc-l3)';
    }}
    onMouseLeave={(e) => {
      (e.currentTarget as HTMLDivElement).style.boxShadow = '';
      (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--wo-card-border)';
    }}
  >
    <span className="text-xs opacity-35 uppercase tracking-wider leading-tight mb-1">{label}</span>
    <div className="flex items-end gap-1">
      <span className={`text-xl font-bold tabular-nums leading-none`}
        style={accent ? {
          color: 'var(--wc-l4)',
          animation: 'glowPulse 2.5s ease-in-out infinite',
          textShadow: '0 0 8px var(--wc-l4)',
        } : {}}>
        {value}
      </span>
      {unit && <span className="text-xs opacity-50 mb-0.5">{unit}</span>}
    </div>
    {trend !== undefined && trend !== 0 && (
      <span className={`text-xs font-medium tabular-nums mt-0.5 ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
        {trend > 0 ? '↑' : '↓'}{Math.abs(trend)}%
      </span>
    )}
  </div>
);

// =============================================================================
// MAIN PAGE
// =============================================================================
const WorkoutsPage = () => {
  const { workouts, years, thisYear } = useWorkouts();
  const { theme } = useTheme();
  const [year, setYear] = useState(thisYear);
  const [weeklyGoal] = useState(4);
  const [highlightDate, setHighlightDate] = useState<string | undefined>();
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  const filteredWorkouts = useMemo(() => {
    if (year === 'Total') return workouts;
    return workouts.filter((w) => w.start_time.startsWith(year));
  }, [workouts, year]);

  const prevYearWorkouts = useMemo(() => {
    if (year === 'Total') return null;
    const prev = workouts.filter((w) => w.start_time.startsWith(String(parseInt(year, 10) - 1)));
    return prev.length > 0 ? prev : null;
  }, [workouts, year]);

  const stats = useMemo(() => {
    const count = filteredWorkouts.length;
    const totalVolume = filteredWorkouts.reduce((s, w) => s + w.total_volume_kg, 0);
    const totalDuration = filteredWorkouts.reduce((s, w) => s + w.duration_seconds, 0);
    const totalSets = filteredWorkouts.reduce((s, w) => s + w.total_sets, 0);
    const { current: streakCurrent, longest: streakLongest } = calcStreak(filteredWorkouts);
    const exerciseFreq: Record<string, number> = {};
    filteredWorkouts.forEach((w) =>
      w.exercises.filter((ex) => !['warm up', 'warmup'].includes(ex.name.toLowerCase()))
        .forEach((ex) => { exerciseFreq[ex.name] = (exerciseFreq[ex.name] || 0) + ex.sets.length; })
    );
    const topExercises = Object.entries(exerciseFreq).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return { count, totalVolume, totalDuration, totalSets, streakCurrent, streakLongest, topExercises,
      avgDuration: count > 0 ? Math.round(totalDuration / count) : 0 };
  }, [filteredWorkouts]);

  const prevStats = useMemo(() => {
    if (!prevYearWorkouts) return null;
    const count = prevYearWorkouts.length;
    return {
      count,
      totalVolume: prevYearWorkouts.reduce((s, w) => s + w.total_volume_kg, 0),
      totalDuration: prevYearWorkouts.reduce((s, w) => s + w.duration_seconds, 0),
      totalSets: prevYearWorkouts.reduce((s, w) => s + w.total_sets, 0),
    };
  }, [prevYearWorkouts]);

  const trendPct = useCallback((curr: number, prev?: number) =>
    prev && prev > 0 ? Math.round(((curr - prev) / prev) * 100) : undefined, []);

  const scoreMap = useMemo(() => calcSessionScores(filteredWorkouts), [filteredWorkouts]);
  const doubleSessionDates = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredWorkouts.forEach((w) => { const d = w.start_time.slice(0, 10); counts[d] = (counts[d] || 0) + 1; });
    return new Set(Object.entries(counts).filter(([_, c]) => c > 1).map(([d]) => d));
  }, [filteredWorkouts]);

  const handleYearClick = useCallback((y: string) => {
    setYear(y); setHighlightDate(undefined); setSelectedExercise(null);
  }, []);
  const handleSelectExercise = useCallback((name: string) => {
    setSelectedExercise((prev) => prev === name ? null : name);
  }, []);

  return (
    <Layout>
      <Helmet><html lang="en" data-theme={theme} /><title>Workouts</title></Helmet>

      {/* Single full-width child to override Layout's lg:flex */}
      <div className="w-full min-w-0">

        {/* ── HERO ────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-4 italic">Workouts</h1>
            <div className="flex flex-wrap gap-2">
              <HeroStat label={IS_CHINESE ? '训练次数' : 'Sessions'}  value={String(stats.count)}
                trend={trendPct(stats.count, prevStats?.count)} />
              <HeroStat label={IS_CHINESE ? '总出力' : 'Volume'}
                value={(stats.totalVolume / 1000).toFixed(1)} unit="t"
                trend={trendPct(stats.totalVolume, prevStats?.totalVolume)} />
              <HeroStat label={IS_CHINESE ? '总组数' : 'Sets'}        value={String(stats.totalSets)}
                trend={trendPct(stats.totalSets, prevStats?.totalSets)} />
              <HeroStat label={IS_CHINESE ? '平均时长' : 'Avg Time'}  value={formatDuration(stats.avgDuration)} />
              <HeroStat label={IS_CHINESE ? '当前连续' : 'Streak'}    value={`${stats.streakCurrent}d`} accent={stats.streakCurrent >= 3} />
              <HeroStat label={IS_CHINESE ? '最长连续' : 'Best'}      value={`${stats.streakLongest}d`} />
            </div>
          </div>
          <WeeklyGoalWidget workouts={workouts} goal={weeklyGoal} />
        </div>

        {/* ── CONTROLS: Year selector + 30-day strip ───────────────────── */}
        <div className="flex flex-wrap items-start gap-6 mb-6">
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider opacity-35">
              {IS_CHINESE ? '年份' : 'Year'}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {['Total', ...years].map((y) => (
                <button key={y} onClick={() => handleYearClick(y)}
                  className="rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
                  style={year === y
                    ? { background: 'var(--wc-l3)', color: '#fff' }
                    : { background: 'var(--wo-card-bg)', border: '1px solid var(--wo-card-border)', opacity: 0.65 }}>
                  {y}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 min-w-48">
            <Card className="py-3">
              <Recent30DayStrip workouts={workouts} />
            </Card>
          </div>
        </div>

        {/* ── CALENDAR ─────────────────────────────────────────────────── */}
        {year !== 'Total' && (
          <Card className="mb-6 overflow-x-auto">
            <WorkoutCalendar workouts={workouts} year={year}
              onDayClick={(date) => setHighlightDate((prev) => prev === date ? undefined : date)}
            />
          </Card>
        )}

        {/* ── SECTION: 训练记录 ─────────────────────────────────────────── */}
        <SectionHeader label={IS_CHINESE ? '训练记录' : 'Training Log'} />
        <div className="flex flex-col lg:flex-row gap-5">

          {/* Left sidebar */}
          <div className="w-full lg:w-64 xl:w-72 shrink-0 space-y-4">
            <NextSessionGuide workouts={filteredWorkouts} />
            <Card><MilestoneCards workouts={filteredWorkouts} /></Card>
            <Card><StagnationPanel workouts={filteredWorkouts} /></Card>
            <Card><RecoveryRhythm workouts={workouts} /></Card>
          </div>

          {/* Right: workout table — dominant element */}
          <div className="flex-1 min-w-0">
            <WorkoutTable
              workouts={filteredWorkouts}
              highlightDate={highlightDate}
              scoreMap={scoreMap}
              doubleSessionDates={doubleSessionDates}
            />
          </div>
        </div>

        {/* ── SECTION: 名人堂 · HK Neon Billboard ─────────────────────── */}
        <div className="flex items-center gap-3 mt-12 mb-6">
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(255,45,120,0.4), transparent)' }} />
          <div style={{ textAlign: 'center', lineHeight: 1 }}>
            <div style={{
              fontSize: 13, letterSpacing: '0.4em', color: '#ff2d78', fontWeight: 800,
              opacity: 0.82, marginBottom: 4,
            }}>✦ HALL OF FAME ✦</div>
            <div style={{
              fontSize: 20, fontWeight: 900, letterSpacing: '0.15em',
              color: '#ffcc00',
              textShadow: '0 0 10px #ffcc00, 0 0 20px rgba(255,204,0,0.45)',
            }}>名人堂</div>
          </div>
          <div className="h-px flex-1" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,245,255,0.3), transparent)' }} />
        </div>

        <NeonPRWall workouts={filteredWorkouts} />

        {/* ── SECTION: 训练分析 ─────────────────────────────────────────── */}
        <SectionHeader label={IS_CHINESE ? '训练分析' : 'Analytics'} />

        <div className="mb-4">
          <Card><TrainingHeartbeat workouts={filteredWorkouts} /></Card>
        </div>

        <div className="columns-1 md:columns-2 lg:columns-3" style={{ columnGap: 16 }}>
          {[
            <Card key="vol"><VolumeAndSetsChart workouts={filteredWorkouts} /></Card>,
            <Card key="ses"><SessionTrendsChart workouts={filteredWorkouts} /></Card>,
            <Card key="time"><TimeDistributionCharts workouts={filteredWorkouts} /></Card>,
            <Card key="freq"><MonthlyFrequencyChart workouts={filteredWorkouts} /></Card>,
            <Card key="rep"><RepRangePanel workouts={filteredWorkouts} /></Card>,
            <Card key="type"><WorkoutTypeChart workouts={filteredWorkouts} /></Card>,
            <Card key="top"><TopSessionsPanel workouts={filteredWorkouts} scoreMap={scoreMap} /></Card>,
          ].map((card) => (
            <div key={card.key} className="break-inside-avoid mb-4">{card}</div>
          ))}
        </div>

        {/* ── SECTION: 力量分析 ─────────────────────────────────────────── */}
        <SectionHeader label={IS_CHINESE ? '力量分析' : 'Strength'} />

        <div className="columns-1 lg:columns-2" style={{ columnGap: 20 }}>

          <div className="break-inside-avoid mb-5">
            <Card>
              <BestLiftsPanel workouts={filteredWorkouts} selectedExercise={selectedExercise} onSelectExercise={handleSelectExercise} />
            </Card>
          </div>

          <div className="break-inside-avoid mb-5">
            <Card>
              <MuscleBodyMap workouts={filteredWorkouts} />
              <div className="mt-5 pt-4" style={{ borderTop: '1px solid var(--wo-section-line)' }}>
                <MuscleVolumeChart workouts={filteredWorkouts} />
              </div>
            </Card>
          </div>

          {stats.topExercises.length > 0 && (
            <div className="break-inside-avoid mb-5">
              <Card>
                <PanelLabel>{IS_CHINESE ? '常练动作 (点击看进步)' : 'Top Exercises'}</PanelLabel>
                <div className="space-y-0.5">
                  {stats.topExercises.map(([name, sets]) => (
                    <div key={name}
                      className="flex items-center gap-2 text-xs cursor-pointer rounded-lg px-2 py-1.5 -mx-2 transition-all"
                      style={selectedExercise === name ? { background: 'rgba(99,102,241,0.12)' } : {}}
                      onClick={() => handleSelectExercise(name)}
                    >
                      <span className="flex-1 opacity-75 truncate">{translateExercise(name)}</span>
                      <span className="opacity-35 whitespace-nowrap">{sets} sets</span>
                      <span className="opacity-20 text-xs">{selectedExercise === name ? '▾' : '›'}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {selectedExercise && (
            <div className="break-inside-avoid mb-5">
              <ExerciseProgress name={selectedExercise} workouts={workouts} onClose={() => setSelectedExercise(null)} />
            </div>
          )}

          <div className="break-inside-avoid mb-5">
            <Card><MuscleHexPanel workouts={filteredWorkouts} /></Card>
          </div>

          <div className="break-inside-avoid mb-5">
            <Card><PRTimeline workouts={workouts} /></Card>
          </div>

          <div className="break-inside-avoid mb-5">
            <Card><ProgressiveOverloadPanel workouts={filteredWorkouts} /></Card>
          </div>

          <div className="break-inside-avoid mb-5">
            <Card><MuscleDistributionPanel workouts={filteredWorkouts} /></Card>
          </div>

        </div>

        {/* ── SECTION: 恢复状态 ─────────────────────────────────────────── */}
        <SectionHeader label={IS_CHINESE ? '恢复状态' : 'Recovery'} />
        <div className="columns-1 md:columns-2" style={{ columnGap: 16 }}>
          <div className="break-inside-avoid mb-4">
            <Card><MuscleRecovery workouts={filteredWorkouts} /></Card>
          </div>
          <div className="break-inside-avoid mb-4">
            <Card><E1RMCompare workouts={filteredWorkouts} /></Card>
          </div>
        </div>

        {/* ── SECTION: 训练负荷 ─────────────────────────────────────────── */}
        <SectionHeader label={IS_CHINESE ? '训练负荷' : 'Training Load'} />
        <div className="mb-4">
          <Card><TrainingLoad workouts={filteredWorkouts} /></Card>
        </div>
        <div className="columns-1 md:columns-2" style={{ columnGap: 16 }}>
          <div className="break-inside-avoid mb-4">
            <Card><ComparisonPanel workouts={filteredWorkouts} /></Card>
          </div>
          <div className="break-inside-avoid mb-4">
            <Card><HighlightReel workouts={workouts} /></Card>
          </div>
        </div>

        {/* ── SECTION: 成就殿堂 ─────────────────────────────────────────── */}
        <SectionHeader label={IS_CHINESE ? '成就殿堂' : 'Achievements'} />
        <AchievementsPanel workouts={workouts} />

      </div>
    </Layout>
  );
};

export default WorkoutsPage;
