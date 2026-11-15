import { Link } from 'react-router-dom'
import { Screen } from '../components/ui'

/** A plate drawn as three macro arcs: the same ring the app uses to track the day. */
function Plate() {
  const arc = (from: number, to: number) => {
    const point = (deg: number) => {
      const rad = ((deg - 90) * Math.PI) / 180
      return `${160 + 132 * Math.cos(rad)} ${160 + 132 * Math.sin(rad)}`
    }
    return `M ${point(from)} A 132 132 0 ${to - from > 180 ? 1 : 0} 1 ${point(to)}`
  }
  return (
    <svg viewBox="0 0 320 320" className="h-full w-full" fill="none" aria-hidden="true">
      <circle cx="160" cy="160" r="96" fill="#1c1c1c" />
      <circle cx="160" cy="160" r="66" stroke="#3a3a3a" strokeWidth="2" />
      <path d={arc(8, 172)} stroke="#d4ff3a" strokeWidth="26" strokeLinecap="round" />
      <path d={arc(190, 286)} stroke="#ffcc00" strokeWidth="26" strokeLinecap="round" />
      <path d={arc(304, 350)} stroke="#990000" strokeWidth="26" strokeLinecap="round" />
    </svg>
  )
}

export default function Welcome() {
  return (
    <Screen>
      <main className="relative flex flex-1 flex-col justify-between overflow-hidden px-6 pt-10 pb-8">
        <div className="pointer-events-none absolute -top-10 -right-24 h-[340px] w-[340px]">
          <Plate />
        </div>
        <div className="relative">
          <p className="font-display text-xl font-semibold text-gold">TrojanPlate</p>
          <h1 className="mt-[230px] font-display text-[46px] leading-[1.04] font-semibold tracking-tight">
            Your goals.
            <br />
            Your campus.
            <br />
            Your plate.
          </h1>
          <p className="mt-6 max-w-[34ch] text-lg text-paper/80">
            Tell us your goal and what you eat. We plan breakfast, lunch and dinner from USC dining halls and
            restaurants you can walk to.
          </p>
        </div>
        <div className="relative mt-8">
          <Link
            to="/setup"
            className="block w-full rounded-2xl bg-volt px-5 py-4 text-center text-lg font-semibold text-ink shadow-[0_0_24px_rgba(212,255,58,0.25)] hover:brightness-95"
          >
            Set up my profile
          </Link>
          <p className="mt-4 text-sm text-paper/60">
            Takes about a minute. Your details stay on this device. TrojanPlate gives estimates, not medical advice.
          </p>
        </div>
      </main>
    </Screen>
  )
}
