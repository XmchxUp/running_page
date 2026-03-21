import { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { WorkoutSession } from '@/types/workout';
import { loadPhases, PHASE_COLORS, PHASE_STROKE, type TrainingPhase } from './TrainingPhasePanel';

const IS_CHINESE = true;

const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'var(--wo-card-bg)',
  border: '1px solid var(--wo-card-border)',
  borderRadius: 10,
  fontSize: 11,
};

const TrainingLoad = ({ workouts }: { workouts: WorkoutSession[] }) => {
  const phases = useMemo(loadPhases, []);

  const data = useMemo(() => {
    // Build daily volume map
    const volMap: Record<string, number> = {};
    workouts.forEach((w) => {
      const d = w.start_time.slice(0, 10);
      volMap[d] = (volMap[d] || 0) + w.total_volume_kg;
    });

    // Generate last 120 days (extra for warmup period) → show last 90
    const days: string[] = [];
    const now = new Date();
    for (let i = 119; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    // EWMA decay constants
    const k7 = 1 - Math.exp(-1 / 7);
    const k42 = 1 - Math.exp(-1 / 42);
    let atl = 0,
      ctl = 0;

    type DataPoint = {
      date: string;
      atl: number;
      ctl: number;
      tsb: number;
      vol: number;
    };

    const result = days
      .map((date, idx) => {
        const vol = volMap[date] || 0;
        atl = atl * (1 - k7) + vol * k7;
        ctl = ctl * (1 - k42) + vol * k42;
        const tsb = Math.round(ctl - atl);
        if (idx < 30) return null;
        return {
          date: date.slice(5).replace('-', '/'),
          atl: Math.round(atl),
          ctl: Math.round(ctl),
          tsb,
          vol: Math.round(vol),
        };
      })
      .filter((x): x is DataPoint => x !== null);

    return result;
  }, [workouts]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold uppercase tracking-[0.1em] opacity-40">
          {IS_CHINESE ? '训练负荷 ATL/CTL/TSB' : 'Training Load'}
        </div>
        <div className="flex gap-3 text-xs opacity-40">
          <span style={{ color: '#3b82f6' }}>── CTL 体能</span>
          <span style={{ color: '#ef4444' }}>── ATL 疲劳</span>
          <span style={{ color: '#22c55e' }}>▪ TSB 状态</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(128,128,128,0.08)" />
          {phases.map((phase: TrainingPhase) => {
            // Convert YYYY-MM-DD to the chart's MM/DD format
            const fmtDate = (d: string) => d.slice(5).replace('-', '/');
            return (
              <ReferenceArea
                key={phase.id}
                x1={fmtDate(phase.start)} x2={fmtDate(phase.end)}
                fill={PHASE_COLORS[phase.type]}
                stroke={PHASE_STROKE[phase.type]}
                strokeWidth={1}
                strokeDasharray="4 2"
                label={{ value: phase.label || (IS_CHINESE ? { strength:'力量',hypertrophy:'增肌',cut:'减脂',deload:'退量' }[phase.type] : phase.type), fontSize: 9, fill: PHASE_STROKE[phase.type], position: 'insideTop' }}
              />
            );
          })}
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, opacity: 0.35 }}
            tickLine={false}
            axisLine={false}
            interval={Math.floor(data.length / 6)}
          />
          <YAxis tick={{ fontSize: 9, opacity: 0.35 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            formatter={(v: number, name: string) => {
              const labels: Record<string, string> = {
                ctl: '体能(CTL)',
                atl: '疲劳(ATL)',
                tsb: '状态(TSB)',
                vol: '当日出力',
              };
              return [`${v}${name === 'vol' ? ' kg' : ''}`, labels[name] ?? name];
            }}
          />
          <ReferenceLine y={0} stroke="rgba(128,128,128,0.3)" />
          <Area
            dataKey="ctl"
            stroke="#3b82f6"
            fill="rgba(59,130,246,0.08)"
            strokeWidth={2}
            dot={false}
          />
          <Line dataKey="atl" stroke="#ef4444" strokeWidth={1.5} dot={false} />
          <Bar
            dataKey="tsb"
            fill="#22c55e"
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="flex justify-around mt-3">
        {[
          {
            label: IS_CHINESE ? '当前体能' : 'Fitness',
            val: data[data.length - 1]?.ctl ?? 0,
            color: '#3b82f6',
          },
          {
            label: IS_CHINESE ? '当前疲劳' : 'Fatigue',
            val: data[data.length - 1]?.atl ?? 0,
            color: '#ef4444',
          },
          {
            label: IS_CHINESE ? '当前状态' : 'Form',
            val: data[data.length - 1]?.tsb ?? 0,
            color: (data[data.length - 1]?.tsb ?? 0) >= 0 ? '#22c55e' : '#f97316',
          },
        ].map((item) => (
          <div key={item.label} className="text-center">
            <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>
              {item.val > 0 ? '+' : ''}
              {item.val}
            </div>
            <div style={{ fontSize: 10, opacity: 0.4 }}>{item.label}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, opacity: 0.25, marginTop: 8, textAlign: 'center' }}>
        TSB &gt; 0 状态好 · TSB &lt; 0 疲劳 · 参考 Strava PMC 模型
      </div>
    </div>
  );
};

export default TrainingLoad;
