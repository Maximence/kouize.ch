"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const config = {
  score: { label: "Score", color: "var(--series-score)" },
} satisfies ChartConfig;

export type ScorePoint = { n: number; date: string; score: number; mode: string };

/** One series (score % per finished attempt): no legend, the card title names it. */
export function ScoreChart({ data }: { data: ScorePoint[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-48 w-full">
      <LineChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis
          dataKey="n"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={(n) => `#${n}`}
          interval="preserveStartEnd"
        />
        <YAxis domain={[0, 100]} ticks={[0, 50, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} width={44} />
        <ChartTooltip
          cursor={{ strokeDasharray: "3 3" }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as ScorePoint | undefined;
                return p ? `Tentative n° ${p.n} · ${p.date} · ${p.mode}` : "";
              }}
              formatter={(value) => (
                <span className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">Score</span>
                  <span className="font-mono font-medium tabular-nums text-foreground">{value}%</span>
                </span>
              )}
            />
          }
        />
        <Line
          dataKey="score"
          type="linear"
          stroke="var(--color-score)"
          strokeWidth={2}
          dot={{ r: 4, fill: "var(--color-score)", stroke: "var(--background)", strokeWidth: 2 }}
          activeDot={{ r: 5, stroke: "var(--background)", strokeWidth: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
