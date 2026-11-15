import type { ReactNode } from 'react'

/** A progress ring. The arc fills as `value` approaches `max`; children sit in the centre. */
export function Ring({
  value,
  max,
  size = 156,
  stroke = 14,
  tone = 'stroke-volt',
  children,
}: {
  value: number
  max: number
  size?: number
  stroke?: number
  tone?: string
  children?: ReactNode
}) {
  const radius = (size - stroke) / 2
  const around = 2 * Math.PI * radius
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-paper/20" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={around}
          strokeDashoffset={around * (1 - share)}
          className={tone}
          style={{ transition: 'stroke-dashoffset 500ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}
