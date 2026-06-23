import { useMemo, useState } from "react";
import {
  Bar,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

export type SeriesKey = string;
export type CandlePoint = Record<string, number | string> & { date: string };

interface Series {
  key: SeriesKey;
  label: string;
  /** oklch / hex / css color for the bullish (up) candle */
  upColor: string;
  /** oklch / hex / css color for the bearish (down) candle */
  downColor: string;
  /** value formatter for tooltips/axis */
  format?: (v: number) => string;
}

interface Props {
  data: CandlePoint[];
  series: Series[];
  height?: number;
  /** Optional: default selected series key (defaults to first) */
  defaultSeries?: SeriesKey;
  /** When true, hide internal tab switcher (parent provides one) */
  hideTabs?: boolean;
  /** External controlled selection */
  active?: SeriesKey;
  onChange?: (k: SeriesKey) => void;
}

type Candle = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  bullish: boolean;
  range: [number, number];
};

/** Build OHLC candles from a single-value daily series.
 *  open = previous day's value, close = current day's value.
 *  high/low borrow a fraction of the adjacent volatility so the wicks read
 *  naturally on a smoothed dataset. */
function toCandles(values: { date: string; value: number }[]): Candle[] {
  return values.map((d, i) => {
    const prev = values[i - 1]?.value ?? d.value;
    const next = values[i + 1]?.value ?? d.value;
    const open = prev;
    const close = d.value;
    const swing = Math.max(Math.abs(close - open), Math.abs(next - close), Math.abs(prev - open));
    const mid = (open + close) / 2;
    const high = Math.max(open, close, mid + swing * 0.45);
    const low = Math.min(open, close, mid - swing * 0.45);
    return {
      date: d.date,
      open,
      close,
      high,
      low,
      bullish: close >= open,
      range: [low, high],
    };
  });
}

function CandleShape(props: any) {
  const { x, y, width, height, payload, index, fill, upColor, downColor } = props;
  if (!payload || width <= 0) return null;
  const { open, close, high, low, bullish } = payload as Candle;
  const range = high - low || 1;
  const bodyTopVal = Math.max(open, close);
  const bodyBotVal = Math.min(open, close);
  const bodyTop = y + ((high - bodyTopVal) / range) * height;
  const bodyBottom = y + ((high - bodyBotVal) / range) * height;
  const bodyHeight = Math.max(2, bodyBottom - bodyTop);
  const color = bullish ? upColor : downColor;
  const wickX = x + width / 2;
  const bodyWidth = Math.max(3, width * 0.62);
  const bodyX = x + (width - bodyWidth) / 2;
  void fill;
  return (
    <g
      className="gv-candle"
      style={{
        animationDelay: `${(index ?? 0) * 28}ms`,
        transformOrigin: `${wickX}px ${y + height}px`,
      }}
    >
      <line
        x1={wickX}
        x2={wickX}
        y1={y}
        y2={y + height}
        stroke={color}
        strokeWidth={1.2}
        opacity={0.55}
      />
      <rect
        x={bodyX}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={color}
        rx={2}
        style={{
          filter: `drop-shadow(0 0 6px color-mix(in oklab, ${color} 45%, transparent))`,
        }}
      />
      {/* highlight stroke on the body for crispness */}
      <rect
        x={bodyX}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        rx={2}
        fill="none"
        stroke={color}
        strokeOpacity={0.95}
        strokeWidth={1}
      />
    </g>
  );
}

function CandleTooltip({ active, payload, format }: any) {
  if (!active || !payload || !payload.length) return null;
  const p: Candle = payload[0].payload;
  const fmt = (n: number) => (format ? format(n) : n.toLocaleString());
  const change = p.close - p.open;
  const changePct = p.open ? (change / Math.abs(p.open)) * 100 : 0;
  const up = p.bullish;
  return (
    <div
      className="rounded-xl border border-border/70 bg-background/95 backdrop-blur px-3 py-2 text-xs shadow-2xl"
      style={{ minWidth: 150 }}
    >
      <div className="font-semibold text-foreground mb-1.5 flex items-center gap-2">
        <span
          className="size-1.5 rounded-full"
          style={{ background: up ? "oklch(0.78 0.18 165)" : "oklch(0.66 0.22 25)" }}
        />
        {p.date}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span className="text-muted-foreground">Open</span>
        <span className="text-right font-medium">{fmt(p.open)}</span>
        <span className="text-muted-foreground">High</span>
        <span className="text-right font-medium text-emerald-300">{fmt(p.high)}</span>
        <span className="text-muted-foreground">Low</span>
        <span className="text-right font-medium text-rose-300">{fmt(p.low)}</span>
        <span className="text-muted-foreground">Close</span>
        <span className="text-right font-semibold">{fmt(p.close)}</span>
      </div>
      <div
        className="mt-1.5 pt-1.5 border-t border-border/60 flex items-center justify-between text-[11px]"
        style={{ color: up ? "oklch(0.82 0.16 165)" : "oklch(0.72 0.2 25)" }}
      >
        <span>{up ? "▲" : "▼"} {fmt(Math.abs(change))}</span>
        <span>{change >= 0 ? "+" : ""}{changePct.toFixed(1)}%</span>
      </div>
    </div>
  );
}

export default function CandlestickChart({
  data,
  series,
  height = 280,
  defaultSeries,
  hideTabs,
  active,
  onChange,
}: Props) {
  const [internal, setInternal] = useState<SeriesKey>(defaultSeries ?? series[0]?.key);
  const current = active ?? internal;
  const activeSeries = series.find((s) => s.key === current) ?? series[0];

  const candles = useMemo(() => {
    const values = (data ?? []).map((d) => ({
      date: String(d.date),
      value: Number(d[activeSeries.key] ?? 0),
    }));
    return toCandles(values);
  }, [data, activeSeries.key]);

  const fmt = activeSeries.format ?? ((v: number) => v.toLocaleString());

  return (
    <div className="w-full">
      {!hideTabs && series.length > 1 && (
        <div className="mb-3 inline-flex rounded-lg border border-border bg-surface/60 p-0.5">
          {series.map((s) => {
            const isActive = s.key === current;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setInternal(s.key);
                  onChange?.(s.key);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className="inline-block size-1.5 rounded-full mr-1.5 align-middle"
                  style={{ background: s.upColor }}
                />
                {s.label}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ height }}>
        <ResponsiveContainer>
          <ComposedChart data={candles} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id={`gv-bg-${activeSeries.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={activeSeries.upColor} stopOpacity={0.06} />
                <stop offset="1" stopColor={activeSeries.upColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="oklch(0.55 0.04 260 / 0.18)" strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="oklch(0.6 0.025 255)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: string) => v?.slice(5)}
              interval="preserveStartEnd"
            />
            <YAxis
              stroke="oklch(0.6 0.025 255)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={42}
              tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            />
            <Tooltip
              cursor={{ stroke: "oklch(0.7 0.04 260 / 0.4)", strokeWidth: 1, strokeDasharray: "3 4" }}
              content={<CandleTooltip format={fmt} />}
            />
            <Bar
              dataKey="range"
              isAnimationActive={false}
              shape={(p: any) => (
                <CandleShape {...p} upColor={activeSeries.upColor} downColor={activeSeries.downColor} />
              )}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <style>{`
        .gv-candle { animation: gvRise 0.55s cubic-bezier(.2,.8,.2,1) both; transform-box: fill-box; }
        .gv-candle rect { transition: filter 0.2s ease; }
        .gv-candle:hover rect { filter: drop-shadow(0 0 10px color-mix(in oklab, currentColor 65%, transparent)) brightness(1.1); }
        @keyframes gvRise {
          0%   { transform: scaleY(0); opacity: 0; }
          60%  { transform: scaleY(1.06); opacity: 1; }
          100% { transform: scaleY(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
