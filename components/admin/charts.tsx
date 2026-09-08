"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RatingBucket, TrendPoint, BranchComparisonRow, QuestionAverageRow } from "@/lib/modules/feedback/server";
import { RATING_LABEL_BY_SCORE } from "@/lib/modules/feedback/constants";

const AXIS_STYLE = { fontSize: 12, fill: "var(--muted-foreground)" };
const GRID_STROKE = "var(--border)";

// Ordinal, meaningful colors: each rating tier gets its own status hue so
// the distribution reads at a glance instead of needing a legend.
const RATING_COLORS: Record<number, string> = {
  1: "var(--status-critical)",
  2: "var(--status-serious)",
  3: "var(--status-warning)",
  4: "color-mix(in oklch, var(--status-good), white 20%)",
  5: "var(--status-good)",
};

// Fixed-order categorical palette for the five (identity) questions.
const CATEGORICAL_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: { value: number; name: string; payload: Record<string, unknown> }[];
  label?: string;
  formatter?: (payload: Record<string, unknown>) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {formatter ? formatter(payload[0].payload) : null}
    </div>
  );
}

export function RatingDistributionChart({ data, labels }: { data: RatingBucket[]; labels?: string[] }) {
  const chartData = data.map((d) => ({ ...d, label: labels?.[d.score - 1] ?? RATING_LABEL_BY_SCORE[d.score] }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="score" tickLine={false} axisLine={false} tick={AXIS_STYLE} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_STYLE} width={36} />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltip
              formatter={(row) => (
                <p>
                  <span className="font-semibold">{String(row.count)}</span> submission
                  {row.count === 1 ? "" : "s"} · {String(row.label)}
                </p>
              )}
            />
          }
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {chartData.map((d) => (
            <Cell key={d.score} fill={RATING_COLORS[d.score]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const chartData = data.map((d) => {
    // Daily/weekly buckets key by "YYYY-MM-DD"; monthly buckets key by
    // "YYYY-MM" — pad the latter so it still parses as a valid date.
    const isMonthly = d.date.length === 7;
    const iso = isMonthly ? `${d.date}-01` : d.date;
    const label = new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      day: isMonthly ? undefined : "numeric",
      year: isMonthly ? "numeric" : undefined,
      timeZone: "UTC",
    });
    return { ...d, label };
  });

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_STYLE} minTickGap={24} />
        <YAxis domain={[0, 5]} tickLine={false} axisLine={false} tick={AXIS_STYLE} width={32} />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          content={
            <ChartTooltip
              formatter={(row) => (
                <div className="space-y-0.5">
                  <p>
                    Avg score: <span className="font-semibold">{row.avgScore != null ? String(row.avgScore) : "-"}</span>
                  </p>
                  <p className="text-muted-foreground">{String(row.count)} submissions</p>
                </div>
              )}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="avgScore"
          stroke="var(--chart-1)"
          strokeWidth={2}
          dot={{ r: 3, fill: "var(--chart-1)", strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BranchComparisonChart({ data }: { data: BranchComparisonRow[] }) {
  const chartData = data
    .filter((d) => d.count > 0)
    .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
    .map((d) => ({ ...d, shortName: d.branchName.replace(/^Basilissa\s*/i, "") }));

  if (chartData.length === 0) {
    return <EmptyChartState message="No submissions yet for the selected filters." />;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 44)}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={{ top: 8, right: 24, left: 8, bottom: 0 }}
      >
        <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
        <XAxis type="number" domain={[0, 5]} tickLine={false} axisLine={false} tick={AXIS_STYLE} />
        <YAxis
          type="category"
          dataKey="shortName"
          tickLine={false}
          axisLine={false}
          tick={AXIS_STYLE}
          width={110}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltip
              formatter={(row) => (
                <div className="space-y-0.5">
                  <p>
                    Avg score: <span className="font-semibold">{row.avgScore != null ? String(row.avgScore) : "-"}</span>
                  </p>
                  <p className="text-muted-foreground">{String(row.count)} submissions</p>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="avgScore" radius={[0, 6, 6, 0]} maxBarSize={28} fill="var(--chart-1)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function QuestionAveragesChart({ data }: { data: QuestionAverageRow[] }) {
  const chartData = data.map((d, i) => ({
    ...d,
    shortText: d.text.replace(/^How (would you rate|likely are you to)\s*/i, "").replace(/\?$/, ""),
    color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis
          dataKey="order"
          tickLine={false}
          axisLine={false}
          tick={AXIS_STYLE}
          tickFormatter={(order: number) => `Q${order}`}
        />
        <YAxis domain={[0, 5]} tickLine={false} axisLine={false} tick={AXIS_STYLE} width={32} />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={
            <ChartTooltip
              formatter={(row) => (
                <div className="max-w-[220px] space-y-0.5">
                  <p className="text-muted-foreground">{String(row.text)}</p>
                  <p>
                    Avg score: <span className="font-semibold">{row.avgScore != null ? String(row.avgScore) : "-"}</span> ·{" "}
                    {String(row.count)} answers
                  </p>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="avgScore" radius={[6, 6, 0, 0]} maxBarSize={56}>
          {chartData.map((d) => (
            <Cell key={d.questionId} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {message}
    </div>
  );
}
