"use client";

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import type { BiomarkerTimeline } from "@/lib/types";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div className="bg-surface-2 border border-white/10 rounded-xl px-3 py-2 shadow-xl">
      <div className="text-[11px] text-slate-500 mb-0.5">{label}</div>
      <div className="text-base font-bold" style={{ color: d.color || "#67e8f9" }}>
        {d.value}{" "}
        <span className="text-[11px] font-normal text-slate-500">{d.payload?.unit || ""}</span>
      </div>
      {d.payload?.flag && d.payload.flag !== "normal" && (
        <div className="text-[10px] mt-0.5" style={{ color: d.payload.flag === "high" ? "#f87171" : "#60a5fa" }}>
          {d.payload.flag === "high" ? "↑ Выше нормы" : "↓ Ниже нормы"}
        </div>
      )}
    </div>
  );
}

export default function BiomarkerCard({
  timeline,
  accentColor = "#06b6d4",
}: {
  timeline: BiomarkerTimeline;
  accentColor?: string;
}) {
  const latest = timeline.points[timeline.points.length - 1];
  const prev = timeline.points.length > 1 ? timeline.points[timeline.points.length - 2] : null;
  const trend = prev ? latest.value - prev.value : 0;
  const trendPct = prev ? ((trend / prev.value) * 100).toFixed(1) : null;
  const isAbnormal = latest.flag !== "normal";

  const chartData = timeline.points.map((p) => ({
    date: p.date,
    value: p.value,
    flag: p.flag,
    unit: timeline.unit,
  }));

  const gradientId = `grad-${timeline.canonical}`;

  return (
    <div
      className={`rounded-2xl overflow-hidden transition-colors ${
        isAbnormal ? "border border-red-800/25" : "border border-white/[0.06]"
      }`}
      style={{ background: "linear-gradient(135deg, #12121f 0%, #161628 100%)" }}
    >
      {/* Header */}
      <div className="px-4 pt-4 pb-2 flex justify-between items-start">
        <div>
          <div className="text-sm font-bold text-slate-200 tracking-tight">{timeline.name}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">{timeline.unit}</div>
        </div>
        <div className="text-right">
          <div
            className="text-2xl font-extrabold tracking-tight"
            style={{
              color: isAbnormal
                ? latest.flag === "high" ? "#f87171" : "#60a5fa"
                : accentColor,
            }}
          >
            {latest.value}
          </div>
          {trendPct && (
            <div
              className="text-[10px] font-semibold mt-0.5"
              style={{
                color: trend > 0
                  ? latest.flag === "high" ? "#f8717180" : "#34d39980"
                  : latest.flag === "low" ? "#60a5fa80" : "#f5930080",
              }}
            >
              {trend > 0 ? "▲" : "▼"} {Math.abs(Number(trendPct))}%
            </div>
          )}
        </div>
      </div>

      {/* Chart */}
      <div className="px-1.5 h-24">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 12, bottom: 0, left: 12 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accentColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={accentColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {timeline.ref_max != null && (
              <ReferenceLine y={timeline.ref_max} stroke="#334155" strokeDasharray="3 3" strokeWidth={1} />
            )}
            {timeline.ref_min != null && timeline.ref_min > 0 && (
              <ReferenceLine y={timeline.ref_min} stroke="#334155" strokeDasharray="3 3" strokeWidth={1} />
            )}
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#475569" }} axisLine={false} tickLine={false} />
            <YAxis hide domain={["auto", "auto"]} />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={accentColor}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={{ r: 3, fill: accentColor, stroke: "#12121f", strokeWidth: 2 }}
              activeDot={{ r: 6, strokeWidth: 2, stroke: "#12121f" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 flex justify-between text-[10px] text-slate-600">
        <span>
          {timeline.ref_min != null && timeline.ref_max != null
            ? `Норма: ${timeline.ref_min}–${timeline.ref_max}`
            : "Норма: —"}
        </span>
        <span>{timeline.points.length} измерений</span>
      </div>
    </div>
  );
}
