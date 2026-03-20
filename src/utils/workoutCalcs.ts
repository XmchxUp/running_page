import type { WorkoutSession } from '@/types/workout';

// Exercises where lower weight = stronger (assisted resistance helps less = harder)
const ASSISTED_PATTERN = /assisted/i;
const isAssisted = (name: string): boolean => ASSISTED_PATTERN.test(name);

// ─────────────────────────────────────────────────────────────────────────────
// e1RM — Epley formula
// ─────────────────────────────────────────────────────────────────────────────
export const calcE1RM = (weight: number, reps: number): number => {
  if (reps <= 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
};

// ─────────────────────────────────────────────────────────────────────────────
// Streak
// ─────────────────────────────────────────────────────────────────────────────
export const calcStreak = (workouts: WorkoutSession[]): { current: number; longest: number } => {
  if (workouts.length === 0) return { current: 0, longest: 0 };
  const toLocal = (d: Date) => {
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const dates = [...new Set(workouts.map((w) => w.start_time.slice(0, 10)))].sort();
  let longest = 1, streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const diff = (new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime()) / 86400000;
    if (diff === 1) { streak++; longest = Math.max(longest, streak); } else streak = 1;
  }
  const today = toLocal(new Date()), yesterday = toLocal(new Date(Date.now() - 86400000));
  const dateSet = new Set(dates);
  let current = 0;
  if (dateSet.has(today) || dateSet.has(yesterday)) {
    let d = new Date(dateSet.has(today) ? today : yesterday);
    while (dateSet.has(toLocal(d))) { current++; d = new Date(d.getTime() - 86400000); }
  }
  return { current, longest: Math.max(longest, 1) };
};

// ─────────────────────────────────────────────────────────────────────────────
// Best lifts — ranked by e1RM
// ─────────────────────────────────────────────────────────────────────────────
export const calcBestLifts = (
  workouts: WorkoutSession[], topN = 6
): Array<{ name: string; weight: number; reps: number; e1rm: number; date: string }> => {
  const best: Record<string, { weight: number; reps: number; e1rm: number; date: string }> = {};
  [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach((w) => {
    w.exercises.forEach((ex) => {
      if (['warm up', 'warmup'].includes(ex.name.toLowerCase())) return;
      ex.sets.forEach((s) => {
        if (!['normal', 'dropset', 'failure'].includes(s.type)) return;
        const kg = s.weight_kg ?? 0, reps = s.reps ?? 1;
        if (kg > 0) {
          const e1rm = calcE1RM(kg, reps);
          if (isAssisted(ex.name) ? e1rm < (best[ex.name]?.e1rm ?? Infinity) : e1rm > (best[ex.name]?.e1rm ?? 0))
            best[ex.name] = { weight: kg, reps, e1rm, date: w.start_time.slice(0, 10) };
        }
      });
    });
  });
  return Object.entries(best).map(([name, d]) => ({ name, ...d }))
    .sort((a, b) => b.e1rm - a.e1rm).slice(0, topN);
};

// ─────────────────────────────────────────────────────────────────────────────
// Exercise history helper
// ─────────────────────────────────────────────────────────────────────────────
export type ExHistory = Record<string, Array<{ date: string; e1rm: number; weight: number; reps: number; sessionVol: number }>>;

export const buildExerciseHistory = (workouts: WorkoutSession[]): ExHistory => {
  const history: ExHistory = {};
  [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach((w) => {
    w.exercises.forEach((ex) => {
      if (['warm up', 'warmup'].includes(ex.name.toLowerCase())) return;
      let bestE1rm = 0, bestWeight = 0, bestReps = 0, sessionVol = 0;
      ex.sets.forEach((s) => {
        if (!['normal', 'dropset', 'failure'].includes(s.type)) return;
        if (s.weight_kg && s.reps) {
          const e1rm = calcE1RM(s.weight_kg, s.reps);
          sessionVol += s.weight_kg * s.reps;
          if (e1rm > bestE1rm) { bestE1rm = e1rm; bestWeight = s.weight_kg; bestReps = s.reps; }
        }
      });
      if (bestE1rm > 0) {
        if (!history[ex.name]) history[ex.name] = [];
        history[ex.name].push({ date: w.start_time.slice(0, 10), e1rm: bestE1rm, weight: bestWeight, reps: bestReps, sessionVol });
      }
    });
  });
  return history;
};

// ─────────────────────────────────────────────────────────────────────────────
// Session scores  (0–100)
// ─────────────────────────────────────────────────────────────────────────────
export const calcSessionScores = (workouts: WorkoutSession[]): Record<string, number> => {
  if (workouts.length === 0) return {};
  const vols = workouts.map((w) => w.total_volume_kg);
  const sets = workouts.map((w) => w.total_sets);
  const effs = workouts.filter((w) => w.total_volume_kg > 0 && w.duration_seconds > 0)
    .map((w) => w.total_volume_kg / (w.duration_seconds / 60));
  const [minVol, maxVol] = [Math.min(...vols), Math.max(...vols)];
  const [minSets, maxSets] = [Math.min(...sets), Math.max(...sets)];
  const [minEff, maxEff] = effs.length ? [Math.min(...effs), Math.max(...effs)] : [0, 1];
  const scores: Record<string, number> = {};
  workouts.forEach((w) => {
    const volScore  = maxVol  > minVol  ? ((w.total_volume_kg - minVol)  / (maxVol  - minVol))  * 50 : 25;
    const setsScore = maxSets > minSets ? ((w.total_sets      - minSets) / (maxSets - minSets)) * 30 : 15;
    const eff       = w.duration_seconds > 0 ? w.total_volume_kg / (w.duration_seconds / 60) : 0;
    const effScore  = maxEff  > minEff  ? ((eff - minEff)  / (maxEff  - minEff))  * 20 : 10;
    scores[w.id] = Math.round(volScore + setsScore + effScore);
  });
  return scores;
};

// ─────────────────────────────────────────────────────────────────────────────
// Stagnation
// ─────────────────────────────────────────────────────────────────────────────
export const calcStagnation = (workouts: WorkoutSession[], threshold = 3) => {
  const history = buildExerciseHistory(workouts);
  const result: Array<{ name: string; sessionsSincePR: number; bestE1rm: number; lastPRDate: string }> = [];
  for (const [name, sessions] of Object.entries(history)) {
    if (sessions.length < threshold) continue;
    let runningMax = 0, lastPRIndex = -1;
    sessions.forEach((s, i) => { if (s.e1rm > runningMax) { runningMax = s.e1rm; lastPRIndex = i; } });
    const sessionsSincePR = sessions.length - 1 - lastPRIndex;
    if (sessionsSincePR >= threshold)
      result.push({ name, sessionsSincePR, bestE1rm: runningMax, lastPRDate: sessions[lastPRIndex].date });
  }
  return result.sort((a, b) => b.sessionsSincePR - a.sessionsSincePR);
};

// ─────────────────────────────────────────────────────────────────────────────
// Progressive overload
// ─────────────────────────────────────────────────────────────────────────────
export const calcProgressiveOverload = (workouts: WorkoutSession[]) => {
  const history = buildExerciseHistory(workouts);
  return Object.entries(history)
    .filter(([_, h]) => h.length >= 3)
    .map(([name, h]) => {
      const firstE1rm = h[0].e1rm, lastE1rm = h[h.length - 1].e1rm;
      const pctChange = Math.round(((lastE1rm - firstE1rm) / firstE1rm) * 100);
      return { name, firstE1rm, lastE1rm, pctChange, sessions: h.length };
    })
    .filter((x) => x.pctChange !== 0)
    .sort((a, b) => b.pctChange - a.pctChange);
};

// ─────────────────────────────────────────────────────────────────────────────
// PR timeline
// ─────────────────────────────────────────────────────────────────────────────
export const buildPRTimeline = (workouts: WorkoutSession[]) => {
  const events: Array<{ date: string; exercise: string; e1rm: number; weight: number; reps: number; prevE1rm: number | null }> = [];
  const allTimeBest: Record<string, number> = {};
  [...workouts].sort((a, b) => a.start_time.localeCompare(b.start_time)).forEach((w) => {
    w.exercises.forEach((ex) => {
      if (['warm up', 'warmup'].includes(ex.name.toLowerCase())) return;
      let bestE1rm = 0, bestWeight = 0, bestReps = 0;
      ex.sets.forEach((s) => {
        if (!['normal', 'dropset', 'failure'].includes(s.type)) return;
        if (s.weight_kg && s.reps) {
          const e1rm = calcE1RM(s.weight_kg, s.reps);
          if (e1rm > bestE1rm) { bestE1rm = e1rm; bestWeight = s.weight_kg; bestReps = s.reps; }
        }
      });
      if (bestE1rm > 0 && (isAssisted(ex.name) ? bestE1rm < (allTimeBest[ex.name] ?? Infinity) : bestE1rm > (allTimeBest[ex.name] ?? 0))) {
        events.push({ date: w.start_time.slice(0, 10), exercise: ex.name, e1rm: bestE1rm, weight: bestWeight, reps: bestReps, prevE1rm: allTimeBest[ex.name] ?? null });
        allTimeBest[ex.name] = bestE1rm;
      }
    });
  });
  return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
};
