import { useState, useMemo, useCallback } from 'react';
import { Helmet } from 'react-helmet-async';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import Layout from '@/components/Layout';
import useWorkouts, { formatDuration } from '@/hooks/useWorkouts';
import WorkoutCalendar from '@/components/WorkoutCalendar';
import WorkoutTable from '@/components/WorkoutTable';
import { useTheme } from '@/hooks/useTheme';
import { WorkoutSession } from '@/types/workout';

const IS_CHINESE = true;

// ---------------------------------------------------------------------------
// Streak calculator — returns current and longest streak (consecutive days)
// ---------------------------------------------------------------------------
const calcStreak = (workouts: WorkoutSession[]): { current: number; longest: number } => {
  if (workouts.length === 0) return { current: 0, longest: 0 };

  const dates = [...new Set(workouts.map((w) => w.start_time.slice(0, 10)))].sort();
  let longest = 1;
  let streak = 1;

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1]);
    const curr = new Date(dates[i]);
    const diff = (curr.getTime() - prev.getTime()) / 86400000;
    if (diff === 1) { streak++; longest = Math.max(longest, streak); }
    else { streak = 1; }
  }

  // Current streak: check if today or yesterday is in the set
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const dateSet = new Set(dates);
  let current = 0;
  if (dateSet.has(today) || dateSet.has(yesterday)) {
    const startFrom = dateSet.has(today) ? today : yesterday;
    let d = new Date(startFrom);
    while (dateSet.has(d.toISOString().slice(0, 10))) {
      current++;
      d = new Date(d.getTime() - 86400000);
    }
  }

  return { current, longest: Math.max(longest, 1) };
};

// ---------------------------------------------------------------------------
// Best lifts — top PR per exercise (sorted by weight)
// ---------------------------------------------------------------------------
const calcBestLifts = (
  workouts: WorkoutSession[],
  topN = 5
): Array<{ name: string; weight: number; date: string }> => {
  const best: Record<string, { weight: number; date: string }> = {};

  [...workouts]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .forEach((w) => {
      w.exercises.forEach((ex) => {
        if (['warm up', 'warmup'].includes(ex.name.toLowerCase())) return;
        ex.sets.forEach((s) => {
          if (!['normal', 'dropset', 'failure'].includes(s.type)) return;
          const kg = s.weight_kg ?? 0;
          if (kg > 0 && kg > (best[ex.name]?.weight ?? 0)) {
            best[ex.name] = { weight: kg, date: w.start_time.slice(0, 10) };
          }
        });
      });
    });

  return Object.entries(best)
    .map(([name, { weight, date }]) => ({ name, weight, date }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, topN);
};

// ---------------------------------------------------------------------------
// Weekly volume bar chart
// ---------------------------------------------------------------------------
const VolumeChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const data = useMemo(() => {
    const weeks: Record<string, number> = {};
    workouts.forEach((w) => {
      const d = new Date(w.start_time);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const weekNum = Math.ceil(
        ((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7
      );
      const key = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
      weeks[key] = (weeks[key] || 0) + w.total_volume_kg;
    });
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, volume]) => ({ week: week.slice(5), volume: Math.round(volume) }));
  }, [workouts]);

  if (data.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="mb-2 text-xs uppercase tracking-wider opacity-40">
        {IS_CHINESE ? '每周负重趋势' : 'Weekly Volume'}
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
          <XAxis dataKey="week" tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.4 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.4 }} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-background)',
              border: '1px solid rgba(128,128,128,0.2)',
              borderRadius: 6, fontSize: 12,
              color: 'currentColor',
            }}
            formatter={(v: number) => [`${v.toLocaleString()} kg`, IS_CHINESE ? '负重' : 'Volume']}
          />
          <Bar dataKey="volume" fill="var(--wc-l3)" opacity={0.85} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Monthly frequency bar chart
// ---------------------------------------------------------------------------
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const MonthlyFrequencyChart = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const data = useMemo(() => {
    const months: Record<string, number> = {};
    workouts.forEach((w) => {
      const key = w.start_time.slice(0, 7); // YYYY-MM
      months[key] = (months[key] || 0) + 1;
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => {
        const m = parseInt(key.slice(5, 7), 10) - 1;
        return { label: MONTH_SHORT[m], count };
      });
  }, [workouts]);

  if (data.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="mb-2 text-xs uppercase tracking-wider opacity-40">
        {IS_CHINESE ? '每月训练次数' : 'Monthly Sessions'}
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <BarChart data={data} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
          <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.4 }} />
          <YAxis tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.4 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{
              background: 'var(--color-background)',
              border: '1px solid rgba(128,128,128,0.2)',
              borderRadius: 6, fontSize: 12,
            }}
            formatter={(v: number) => [v, IS_CHINESE ? '次' : 'Sessions']}
          />
          <Bar dataKey="count" fill="var(--wc-l2)" opacity={0.9} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Exercise progress line chart
// ---------------------------------------------------------------------------
const ExerciseProgress = ({
  name, workouts, onClose,
}: { name: string; workouts: WorkoutSession[]; onClose: () => void }) => {
  const data = useMemo(() => {
    const points: Array<{ date: string; maxWeight: number }> = [];
    [...workouts]
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .forEach((w) => {
        const ex = w.exercises.find((e) => e.name === name);
        if (!ex) return;
        const normalSets = ex.sets.filter(
          (s) => ['normal', 'dropset', 'failure'].includes(s.type)
        );
        if (normalSets.length === 0) return;
        const maxWeight = Math.max(...normalSets.map((s) => s.weight_kg ?? 0));
        points.push({ date: w.start_time.slice(0, 10), maxWeight });
      });
    return points;
  }, [name, workouts]);

  const prDates = useMemo(() => {
    let best = 0;
    const prs = new Set<string>();
    data.forEach((d) => { if (d.maxWeight > best) { best = d.maxWeight; prs.add(d.date); } });
    return prs;
  }, [data]);

  return (
    <div className="mt-3 rounded-xl p-3"
      style={{ background: 'rgba(128,128,128,0.06)', border: '1px solid rgba(128,128,128,0.12)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-sm truncate">{name}</span>
        <button onClick={onClose} className="ml-2 text-xs opacity-40 hover:opacity-80 shrink-0">✕</button>
      </div>
      {data.length === 0 ? (
        <div className="text-xs opacity-40">No weight data</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.12)" />
              <XAxis dataKey="date" tick={{ fontSize: 8, fill: 'currentColor', opacity: 0.4 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 9, fill: 'currentColor', opacity: 0.4 }} unit="kg" />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-background)',
                  border: '1px solid rgba(128,128,128,0.2)',
                  borderRadius: 6, fontSize: 12,
                }}
                formatter={(v: number) => [`${v} kg`, IS_CHINESE ? '最大重量' : 'Max Weight']}
              />
              <Line
                type="monotone" dataKey="maxWeight"
                stroke="var(--wc-l3)" strokeWidth={2}
                dot={(props: any) => {
                  const isPR = prDates.has(props.payload.date);
                  return (
                    <circle key={props.key} cx={props.cx} cy={props.cy}
                      r={isPR ? 5 : 3}
                      fill={isPR ? 'var(--wt-pr-color)' : 'var(--wc-l3)'} stroke="none" />
                  );
                }}
              />
            </LineChart>
          </ResponsiveContainer>
          <div className="mt-1.5 flex items-center gap-3 text-xs opacity-50">
            <span><span style={{ color: 'var(--wt-pr-color)' }}>●</span> {IS_CHINESE ? '个人最重' : 'PR'}</span>
            <span>{data.length} sessions</span>
            <span>{IS_CHINESE ? '最大' : 'Best'}: {Math.max(...data.map((d) => d.maxWeight))} kg</span>
          </div>
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Best lifts panel
// ---------------------------------------------------------------------------
const BestLiftsPanel = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const lifts = useMemo(() => calcBestLifts(workouts, 5), [workouts]);
  if (lifts.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="mb-2 text-xs uppercase tracking-wider opacity-40">
        {IS_CHINESE ? '个人最佳 (重量 PR)' : 'Personal Bests'}
      </div>
      <div className="space-y-1.5">
        {lifts.map(({ name, weight, date }) => (
          <div key={name} className="flex items-center gap-2 text-sm">
            <span className="flex-1 opacity-80 truncate">{name}</span>
            <span className="font-semibold tabular-nums" style={{ color: 'var(--wt-pr-color)' }}>{weight} kg</span>
            <span className="text-xs opacity-30 tabular-nums whitespace-nowrap">{date}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
const WorkoutsPage = () => {
  const { workouts, years, thisYear } = useWorkouts();
  const { theme } = useTheme();
  const [year, setYear] = useState(thisYear);
  const [highlightDate, setHighlightDate] = useState<string | undefined>();
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  const filteredWorkouts = useMemo(() => {
    if (year === 'Total') return workouts;
    return workouts.filter((w) => w.start_time.startsWith(year));
  }, [workouts, year]);

  const stats = useMemo(() => {
    const count = filteredWorkouts.length;
    const totalVolume = filteredWorkouts.reduce((sum, w) => sum + w.total_volume_kg, 0);
    const totalDuration = filteredWorkouts.reduce((sum, w) => sum + w.duration_seconds, 0);
    const totalSets = filteredWorkouts.reduce((sum, w) => sum + w.total_sets, 0);
    const { current: streakCurrent, longest: streakLongest } = calcStreak(filteredWorkouts);

    const exerciseFreq: Record<string, number> = {};
    filteredWorkouts.forEach((w) => {
      w.exercises
        .filter((ex) => !['warm up', 'warmup'].includes(ex.name.toLowerCase()))
        .forEach((ex) => { exerciseFreq[ex.name] = (exerciseFreq[ex.name] || 0) + ex.sets.length; });
    });
    const topExercises = Object.entries(exerciseFreq).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const avgDuration = count > 0 ? Math.round(totalDuration / count) : 0;

    return { count, totalVolume, totalDuration, totalSets, streakCurrent, streakLongest, topExercises, avgDuration };
  }, [filteredWorkouts]);

  const handleYearClick = useCallback((y: string) => {
    setYear(y);
    setHighlightDate(undefined);
    setSelectedExercise(null);
  }, []);

  return (
    <Layout>
      <Helmet>
        <html lang="en" data-theme={theme} />
        <title>Workouts</title>
      </Helmet>

      {/* Left panel */}
      <div className="w-full lg:w-1/3">
        <h1 className="my-12 mt-6 text-5xl font-extrabold italic">Workouts</h1>

        {/* Year selector */}
        <div className="mb-5">
          <div className="mb-2 text-xs uppercase tracking-wider opacity-40">Year</div>
          <div className="flex flex-wrap gap-2">
            {['Total', ...years].map((y) => (
              <button key={y} onClick={() => handleYearClick(y)}
                className={`rounded px-3 py-1 text-sm transition-colors ${
                  year === y ? 'bg-green-500 text-black font-semibold' : 'opacity-60 hover:opacity-100'
                }`}
              >{y}</button>
            ))}
          </div>
        </div>

        {/* Summary stats — 2×3 grid */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <StatCard label={IS_CHINESE ? '次数' : 'Sessions'} value={String(stats.count)} />
          <StatCard label={IS_CHINESE ? '总时间' : 'Total Time'} value={formatDuration(stats.totalDuration)} />
          <StatCard label={IS_CHINESE ? '总组数' : 'Total Sets'} value={String(stats.totalSets)} />
          <StatCard
            label={IS_CHINESE ? '总负重' : 'Total Volume'}
            value={`${(stats.totalVolume / 1000).toFixed(1)}t`}
          />
          <StatCard
            label={IS_CHINESE ? '当前连续打卡' : 'Current Streak'}
            value={`${stats.streakCurrent}d`}
            accent={stats.streakCurrent >= 3}
          />
          <StatCard
            label={IS_CHINESE ? '最长连续打卡' : 'Longest Streak'}
            value={`${stats.streakLongest}d`}
          />
          <StatCard
            label={IS_CHINESE ? '平均时长' : 'Avg Duration'}
            value={formatDuration(stats.avgDuration)}
          />
        </div>

        {/* Weekly volume chart */}
        <VolumeChart workouts={filteredWorkouts} />

        {/* Monthly frequency chart */}
        <MonthlyFrequencyChart workouts={filteredWorkouts} />

        {/* Best lifts */}
        <BestLiftsPanel workouts={filteredWorkouts} />

        {/* Top exercises — click to see progress */}
        {stats.topExercises.length > 0 && (
          <div className="mt-6">
            <div className="mb-2 text-xs uppercase tracking-wider opacity-40">
              {IS_CHINESE ? '常练动作 (点击看进步)' : 'Top Exercises (click for progress)'}
            </div>
            <div className="space-y-0.5">
              {stats.topExercises.map(([name, sets]) => (
                <div key={name}
                  className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1.5 -mx-2 transition-colors"
                  style={selectedExercise === name
                    ? { background: 'rgba(34,197,94,0.1)' }
                    : { background: 'transparent' }}
                  onClick={() => setSelectedExercise((p) => p === name ? null : name)}
                >
                  <span className="flex-1 opacity-80 truncate">{name}</span>
                  <span className="text-xs opacity-40 whitespace-nowrap">{sets} sets</span>
                  <span className="text-xs opacity-25">{selectedExercise === name ? '▾' : '›'}</span>
                </div>
              ))}
            </div>

            {selectedExercise && (
              <ExerciseProgress
                name={selectedExercise}
                workouts={workouts}
                onClose={() => setSelectedExercise(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* Right panel */}
      <div className="w-full lg:w-2/3">
        {year !== 'Total' && (
          <WorkoutCalendar
            workouts={workouts}
            year={year}
            onDayClick={(date) => setHighlightDate((prev) => prev === date ? undefined : date)}
          />
        )}
        <WorkoutTable workouts={filteredWorkouts} highlightDate={highlightDate} />
      </div>
    </Layout>
  );
};

const StatCard = ({
  label, value, accent = false,
}: { label: string; value: string; accent?: boolean }) => (
  <div className="rounded-lg p-3" style={{ background: 'rgba(128,128,128,0.07)' }}>
    <div className="text-xs opacity-40 mb-1">{label}</div>
    <div className={`text-xl font-bold ${accent ? 'text-green-400' : ''}`}>{value}</div>
  </div>
);

export default WorkoutsPage;
