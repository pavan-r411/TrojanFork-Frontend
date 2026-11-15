import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Art } from './Art'

export function Screen({ children, nav = false }: { children: ReactNode; /** Leaves room for the floating navigation bar. */ nav?: boolean }) {
  return (
    <div
      className={`relative mx-auto flex min-h-full w-full max-w-[440px] flex-col bg-ink text-paper ${nav ? 'pb-28' : ''}`}
    >
      {/* A low cardinal glow at the top gives the black page some depth. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(70%_100%_at_50%_0%,rgba(153,0,0,0.38),transparent)]"
      />
      <div className="relative flex flex-1 flex-col">{children}</div>
    </div>
  )
}

export function PrimaryButton({ className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`w-full rounded-2xl bg-volt px-5 py-4 text-lg font-semibold text-ink shadow-[0_0_24px_rgba(212,255,58,0.25)] transition hover:brightness-95 disabled:bg-line disabled:text-ash disabled:shadow-none ${className}`}
    />
  )
}

export function OptionRow({
  title,
  detail,
  icon,
  selected,
  onSelect,
  trailing,
}: {
  /** Name of an illustration shown in a tile before the title. */
  icon?: string
  title: string
  detail?: string
  selected: boolean
  onSelect: () => void
  trailing?: ReactNode
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center justify-between gap-4 rounded-2xl border px-4 py-3.5 text-left transition-colors ${
        selected
          ? 'border-volt bg-volt/10 shadow-[0_0_20px_rgba(212,255,58,0.12)]'
          : 'border-line bg-surface hover:border-paper/40'
      }`}
    >
      <span className="flex min-w-0 items-center gap-3">
        {icon && (
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-raised">
            <Art name={icon} />
          </span>
        )}
        <span>
          <span className="block text-[17px] font-semibold">{title}</span>
          {detail && <span className="block text-sm text-ash">{detail}</span>}
        </span>
      </span>
      {trailing}
    </button>
  )
}

export function Chip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={`rounded-full border px-4 py-2 text-[15px] font-medium transition-colors ${
        selected ? 'border-volt bg-volt text-ink' : 'border-line bg-surface hover:border-paper/40'
      }`}
    >
      {label}
    </button>
  )
}

export function Field({
  label,
  suffix,
  className = '',
  ...props
}: { label: string; suffix?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-ash">{label}</span>
      <span className="flex items-center rounded-2xl border border-line bg-surface focus-within:border-volt">
        <input {...props} className="w-full min-w-0 bg-transparent px-4 py-3 text-lg outline-none placeholder:text-ash/60" />
        {suffix && <span className="pr-4 text-ash">{suffix}</span>}
      </span>
    </label>
  )
}

export function UnitToggle<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: readonly T[]
  onChange: (value: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-raised p-1">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          onClick={() => onChange(option)}
          className={`rounded-full px-3 py-1 text-sm font-semibold ${value === option ? 'bg-volt text-ink' : 'text-ash'}`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

/** Daily targets on a dark panel: the calorie figure lit, the macros beneath. */
export function Scoreboard({
  calories,
  caption,
  cells,
}: {
  calories: string
  caption: string
  cells: { label: string; value: string }[]
}) {
  return (
    <section className="rounded-3xl border border-paper/10 bg-surface p-5">
      <p className="text-sm text-ash">{caption}</p>
      <p className="font-display text-[60px] leading-none font-semibold tracking-tight text-volt [text-shadow:0_0_28px_rgba(212,255,58,0.35)]">
        {calories}
      </p>
      <dl className="mt-5 grid grid-cols-3 gap-2">
        {cells.map((cell) => (
          <div key={cell.label} className="rounded-2xl bg-raised px-3 py-2.5">
            <dt className="text-xs text-ash">{cell.label}</dt>
            <dd className="font-display text-2xl leading-tight font-semibold">{cell.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
