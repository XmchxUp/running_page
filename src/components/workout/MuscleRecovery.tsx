import { useMemo } from 'react';
import { WorkoutSession } from '@/types/workout';

const IS_CHINESE = true;

const HEXA_GROUPS = [
  { key: 'chest',     label: '胸部', muscles: ['chest'],                            icon: '💓' },
  { key: 'back',      label: '背部', muscles: ['back'],                             icon: '🦅' },
  { key: 'shoulders', label: '肩部', muscles: ['shoulders'],                        icon: '🏔️' },
  { key: 'arms',      label: '手臂', muscles: ['biceps', 'triceps'],                icon: '💪' },
  { key: 'legs',      label: '腿部', muscles: ['quads', 'hamstrings', 'glutes', 'calves'], icon: '🦵' },
  { key: 'core',      label: '核心', muscles: ['abs'],                              icon: '⚡' },
];

// Inline muscle detection (copy from workouts.tsx logic)
const MUSCLE_PATTERNS: Array<{ muscle: string; patterns: string[] }> = [
  { muscle: 'chest',      patterns: ['bench press', 'chest', 'pec', 'fly', 'push up', 'pushup', 'dip'] },
  { muscle: 'back',       patterns: ['row', 'pull', 'pulldown', 'deadlift', 'lat', 'pullover', 'chin'] },
  { muscle: 'shoulders',  patterns: ['shoulder', 'lateral raise', 'front raise', 'upright row', 'military', 'shrug', 'arnold'] },
  { muscle: 'biceps',     patterns: ['bicep', 'curl', 'hammer', 'preacher', 'concentration'] },
  { muscle: 'triceps',    patterns: ['tricep', 'pushdown', 'pressdown', 'overhead extension', 'skullcrusher', 'close grip'] },
  { muscle: 'quads',      patterns: ['squat', 'leg press', 'leg extension', 'hack squat', 'lunge', 'step up'] },
  { muscle: 'hamstrings', patterns: ['hamstring', 'romanian', 'leg curl', 'lying leg curl', 'seated leg curl'] },
  { muscle: 'glutes',     patterns: ['glute', 'hip thrust', 'hip extension', 'donkey kick', 'bridge'] },
  { muscle: 'calves',     patterns: ['calf', 'calf raise'] },
  { muscle: 'abs',        patterns: ['crunch', 'sit up', 'plank', 'leg raise', 'ab ', 'abs', 'core', 'russian twist', 'torso rotation'] },
];
const getExerciseMuscles = (name: string): string[] => {
  const lower = name.toLowerCase();
  return MUSCLE_PATTERNS.filter(({ patterns }) => patterns.some((p) => lower.includes(p))).map(({ muscle }) => muscle);
};

const MuscleRecovery = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const now = Date.now();

  const recovery = useMemo(() => {
    return HEXA_GROUPS.map((group) => {
      // Find most recent session that trained this muscle group
      let lastDate: Date | null = null;
      let intensity = 0;

      const sorted = [...workouts].sort((a, b) => b.start_time.localeCompare(a.start_time));
      for (const w of sorted) {
        const sessionMuscles = new Set<string>();
        let vol = 0;
        w.exercises.forEach((ex) => {
          const muscles = getExerciseMuscles(ex.name);
          muscles.forEach((m) => sessionMuscles.add(m));
          if (group.muscles.some((gm) => muscles.includes(gm))) {
            const sets = ex.sets.filter((s) => ['normal','dropset','failure'].includes(s.type));
            vol += sets.reduce((s, t) => s + (t.weight_kg ?? 0) * (t.reps ?? 0), 0);
          }
        });
        if (group.muscles.some((m) => sessionMuscles.has(m))) {
          lastDate = new Date(w.start_time);
          intensity = vol;
          break;
        }
      }

      if (!lastDate) return { ...group, pct: 100, hoursAgo: null, status: 'never' as const, hoursLeft: 0 };

      const hoursAgo = (now - lastDate.getTime()) / 3600000;
      const recoveryHours = intensity > 5000 ? 72 : intensity > 2000 ? 60 : 48;
      const pct = Math.min(100, Math.round((hoursAgo / recoveryHours) * 100));
      const hoursLeft = Math.max(0, Math.round(recoveryHours - hoursAgo));

      return {
        ...group,
        pct,
        hoursAgo: Math.round(hoursAgo),
        status: pct >= 95 ? 'ready' as const : pct >= 60 ? 'partial' as const : 'rest' as const,
        hoursLeft,
        intensity,
      };
    });
  }, [workouts, now]);

  const statusColor = (s: string) =>
    s === 'ready' ? '#22c55e' : s === 'partial' ? '#f59e0b' : '#ef4444';
  const statusLabel = (s: string) =>
    s === 'ready' ? '✓ 可以训练' : s === 'never' ? '从未训练' : s === 'partial' ? '部分恢复' : '需要休息';

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.1em] opacity-40 mb-3">
        {IS_CHINESE ? '肌肉恢复状态' : 'Muscle Recovery'}
      </div>
      <div className="space-y-3">
        {recovery.map((r) => (
          <div key={r.key}>
            <div className="flex items-center justify-between mb-1">
              <span className="flex items-center gap-1.5 text-sm">
                <span>{r.icon}</span>
                <span style={{ opacity: 0.8, fontWeight: 500 }}>{IS_CHINESE ? r.label : r.key}</span>
              </span>
              <div className="flex items-center gap-2">
                {r.hoursAgo !== null && (
                  <span style={{ fontSize: 10, opacity: 0.4 }}>
                    {r.hoursAgo < 24 ? `${r.hoursAgo}h前` : `${Math.round(r.hoursAgo/24)}d前`}
                  </span>
                )}
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99,
                  background: statusColor(r.status) + '20', color: statusColor(r.status),
                }}>
                  {r.status === 'ready' || r.status === 'never' ? statusLabel(r.status) : `${r.hoursLeft}h后恢复`}
                </span>
              </div>
            </div>
            <div style={{ height: 5, borderRadius: 99, background: 'rgba(128,128,128,0.12)', overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 99,
                width: `${r.pct}%`,
                background: r.status === 'ready'
                  ? 'linear-gradient(90deg, #22c55e, #4ade80)'
                  : r.status === 'partial'
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(90deg, #ef4444, #f87171)',
                transition: 'width 1s ease',
              }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, opacity: 0.3, marginTop: 12, textAlign: 'right' }}>
        基于最近训练时间 + 强度估算 · 仅供参考
      </div>
    </div>
  );
};

export default MuscleRecovery;
