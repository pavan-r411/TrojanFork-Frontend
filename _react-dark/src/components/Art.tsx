// Illustrations are Microsoft Fluent Emoji 3D renders (MIT licence, see src/assets/art/LICENSE.txt).
const FILES = import.meta.glob<string>('../assets/art/*.png', { eager: true, import: 'default' })
const URL_OF: Record<string, string> = Object.fromEntries(
  Object.entries(FILES).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
)

/** A decorative illustration by name, sized by its container unless a class says otherwise. */
export function Art({ name, className = 'h-[72%] w-[72%]' }: { name: string; className?: string }) {
  return (
    <img
      src={URL_OF[name] ?? URL_OF.plate}
      alt=""
      draggable={false}
      className={`object-contain drop-shadow-[0_4px_8px_rgba(0,0,0,0.45)] ${className}`}
    />
  )
}
