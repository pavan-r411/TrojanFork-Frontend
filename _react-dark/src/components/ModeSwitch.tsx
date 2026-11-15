import type { Mode } from '../api/types'

const OPTIONS: { mode: Mode; name: string }[] = [
  { mode: 'usc_dining', name: 'USC dining' },
  { mode: 'off_campus', name: 'Near campus' },
]

/**
 * One capsule holding both planners, pinned to the top of the screen.
 * A lit thumb slides between the two like a switch.
 */
export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (mode: Mode) => void }) {
  return (
    <div className="pointer-events-none sticky top-0 z-20 flex justify-center px-5 pt-3 pb-2">
      <div
        role="radiogroup"
        aria-label="Where to eat"
        className="pointer-events-auto relative grid h-12 w-full max-w-[300px] grid-cols-2 rounded-full border border-paper/10 bg-ink/85 p-1 shadow-[0_8px_30px_rgba(0,0,0,0.6)] backdrop-blur-xl"
      >
        <span
          aria-hidden="true"
          className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-volt shadow-[0_0_18px_rgba(212,255,58,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.3,1.35,0.5,1)] ${
            mode === 'off_campus' ? 'translate-x-full' : 'translate-x-0'
          }`}
        />
        {OPTIONS.map((option) => (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={mode === option.mode}
            onClick={() => onChange(option.mode)}
            className={`relative z-10 rounded-full text-[15px] font-semibold transition-colors duration-300 ${
              mode === option.mode ? 'text-ink' : 'text-paper/60 hover:text-paper'
            }`}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  )
}
