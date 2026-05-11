"use client"

interface MiniSparklineProps {
  notas: Record<string, string>
  width?: number
  height?: number
  showLabels?: boolean
  threshold?: number
}

export function MiniSparkline({
  notas,
  width = 160,
  height = 48,
  showLabels = true,
  threshold = 4.0,
}: MiniSparklineProps) {
  const vals = Object.values(notas).map(v => parseFloat(v)).filter(v => !isNaN(v))
  if (vals.length < 2) return null

  const w = width, h = height, pad = 8
  const min = 1, max = 7
  const points = vals.map((v, i) => ({
    x: pad + (i / (vals.length - 1)) * (w - pad * 2),
    y: pad + ((max - v) / (max - min)) * (h - pad * 2),
    v,
  }))
  const lineY = pad + ((max - threshold) / (max - min)) * (h - pad * 2)

  return (
    <svg width={w} height={h} className="block">
      <line
        x1={pad}
        y1={lineY}
        x2={w - pad}
        y2={lineY}
        stroke="var(--status-amber-border)"
        strokeWidth="1"
        strokeDasharray="4 3"
      />
      <polyline
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points.map(p => `${p.x},${p.y}`).join(" ")}
      />
      {points.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r="3"
          fill={p.v < threshold ? "var(--status-red-text)" : "var(--primary)"}
        />
      ))}
      {showLabels && (
        <text
          x={w - pad}
          y={lineY - 4}
          textAnchor="end"
          fontSize="8"
          fill="var(--muted-foreground)"
        >
          {threshold.toFixed(1)}
        </text>
      )}
    </svg>
  )
}
