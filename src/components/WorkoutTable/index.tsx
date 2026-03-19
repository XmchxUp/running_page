import { useState, useMemo } from 'react';
import { WorkoutSession, WorkoutExercise } from '@/types/workout';
import { formatDuration } from '@/hooks/useWorkouts';
import styles from './style.module.css';

interface WorkoutTableProps {
  workouts: WorkoutSession[];
  highlightDate?: string;
}

// ---------------------------------------------------------------------------
// Compute per-exercise all-time PR weight map from the full (unfiltered) list
// passed in from parent. Here we compute it from the workouts prop (filtered)
// but the parent always passes the year-filtered list, which is fine.
// ---------------------------------------------------------------------------
const buildPRMap = (workouts: WorkoutSession[]): Record<string, { weight: number; date: string }> => {
  const prMap: Record<string, { weight: number; date: string }> = {};
  // Process in chronological order to track when each PR was first set
  [...workouts]
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .forEach((w) => {
      w.exercises.forEach((ex) => {
        ex.sets.forEach((s) => {
          if (!['normal', 'dropset', 'failure'].includes(s.type)) return;
          const w_kg = s.weight_kg ?? 0;
          if (w_kg > 0 && w_kg > (prMap[ex.name]?.weight ?? 0)) {
            prMap[ex.name] = { weight: w_kg, date: w.start_time.slice(0, 10) };
          }
        });
      });
    });
  return prMap;
};

// ---------------------------------------------------------------------------
// ExerciseDetail: shows sets for one exercise, with PR star on the top set
// ---------------------------------------------------------------------------
const ExerciseDetail = ({
  exercise,
  isPRSession,
  prWeight,
}: {
  exercise: WorkoutExercise;
  isPRSession: boolean;
  prWeight: number;
}) => {
  const normalSets = exercise.sets.filter(
    (s) => s.type === 'normal' || s.type === 'dropset' || s.type === 'failure'
  );
  const warmupSets = exercise.sets.filter((s) => s.type === 'warmup');

  return (
    <div className={styles.exerciseDetail}>
      <span className={styles.exerciseName}>
        {exercise.name}
        {isPRSession && (
          <span className={styles.prBadge} title={`PR: ${prWeight}kg`}>
            ★ PR
          </span>
        )}
      </span>
      <span className={styles.exerciseSets}>
        {warmupSets.length > 0 && (
          <span className={styles.warmupBadge}>{warmupSets.length}w</span>
        )}
        {normalSets.map((s, i) => {
          const isTopSet = s.weight_kg === prWeight && isPRSession;
          if (s.weight_kg !== undefined && s.reps !== undefined) {
            return (
              <span key={i} className={`${styles.setChip} ${isTopSet ? styles.prChip : ''}`}>
                {s.weight_kg}kg×{s.reps}
              </span>
            );
          }
          if (s.reps !== undefined) {
            return (
              <span key={i} className={styles.setChip}>
                ×{s.reps}
              </span>
            );
          }
          if (s.duration_seconds !== undefined) {
            return (
              <span key={i} className={styles.setChip}>
                {formatDuration(s.duration_seconds)}
              </span>
            );
          }
          return null;
        })}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// WorkoutRow
// ---------------------------------------------------------------------------
const WorkoutRow = ({
  workout,
  isHighlighted,
  prMap,
  prSessions,
}: {
  workout: WorkoutSession;
  isHighlighted: boolean;
  prMap: Record<string, { weight: number; date: string }>;
  prSessions: Set<string>;
}) => {
  const [expanded, setExpanded] = useState(false);

  const date = workout.start_time.slice(0, 10);
  const time = workout.start_time.slice(11, 16);
  const hasPR = prSessions.has(workout.id);

  const mainExercises = workout.exercises.filter(
    (ex) => !['warm up', 'warmup'].includes(ex.name.toLowerCase())
  );

  return (
    <>
      <tr
        className={`${styles.workoutRow} ${isHighlighted ? styles.highlighted : ''}`}
        onClick={() => setExpanded((e) => !e)}
        style={{ cursor: 'pointer' }}
      >
        <td className={styles.expandIcon}>{expanded ? '▾' : '▸'}</td>
        <td className={styles.dateCell}>
          <div>{date}</div>
          <div className={styles.timeLabel}>{time}</div>
        </td>
        <td className={styles.titleCell}>
          {workout.title}
          {hasPR && <span className={styles.rowPrBadge}>★</span>}
        </td>
        <td className={styles.metaCell}>{formatDuration(workout.duration_seconds)}</td>
        <td className={styles.metaCell}>{mainExercises.length} exercises</td>
        <td className={styles.metaCell}>{workout.total_sets} sets</td>
        <td className={styles.metaCell}>
          {workout.total_volume_kg > 0
            ? `${workout.total_volume_kg.toLocaleString()} kg`
            : '—'}
        </td>
      </tr>
      {expanded && (
        <tr className={styles.detailRow}>
          <td colSpan={7}>
            <div className={styles.exerciseList}>
              {mainExercises.map((ex, i) => {
                const pr = prMap[ex.name];
                const maxInThisSession = Math.max(
                  ...ex.sets.map((s) => s.weight_kg ?? 0)
                );
                const isPRSession = !!(pr && pr.date === date && maxInThisSession === pr.weight);
                return (
                  <ExerciseDetail
                    key={i}
                    exercise={ex}
                    isPRSession={isPRSession}
                    prWeight={pr?.weight ?? 0}
                  />
                );
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// WorkoutTable
// ---------------------------------------------------------------------------
const WorkoutTable = ({ workouts, highlightDate }: WorkoutTableProps) => {
  const [search, setSearch] = useState('');

  const filteredWorkouts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return workouts;
    return workouts.filter(
      (w) =>
        w.title.toLowerCase().includes(q) ||
        w.exercises.some((ex) => ex.name.toLowerCase().includes(q))
    );
  }, [workouts, search]);

  // Build PR map from the displayed workouts (chronological)
  const prMap = useMemo(() => buildPRMap(workouts), [workouts]);

  // Which workout sessions contain at least one PR
  const prSessions = useMemo(() => {
    const set = new Set<string>();
    [...workouts]
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .forEach((w) => {
        w.exercises.forEach((ex) => {
          const pr = prMap[ex.name];
          if (!pr) return;
          const maxInSession = Math.max(...ex.sets.map((s) => s.weight_kg ?? 0));
          if (maxInSession === pr.weight && w.start_time.slice(0, 10) === pr.date) {
            set.add(w.id);
          }
        });
      });
    return set;
  }, [workouts, prMap]);

  return (
    <div className={styles.tableContainer}>
      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Search by workout or exercise…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={styles.searchInput}
        />
        {search && (
          <span className={styles.searchCount}>
            {filteredWorkouts.length} / {workouts.length}
          </span>
        )}
      </div>
      <table className={styles.workoutTable} cellSpacing="0" cellPadding="0">
        <thead>
          <tr>
            <th />
            <th>Date</th>
            <th>Workout</th>
            <th>Duration</th>
            <th>Exercises</th>
            <th>Sets</th>
            <th>Volume</th>
          </tr>
        </thead>
        <tbody>
          {filteredWorkouts.map((w) => (
            <WorkoutRow
              key={w.id}
              workout={w}
              isHighlighted={!!highlightDate && w.start_time.startsWith(highlightDate)}
              prMap={prMap}
              prSessions={prSessions}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WorkoutTable;
