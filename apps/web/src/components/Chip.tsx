import type { TeamId } from '@lineup/rules';

/** Team chip: colour always paired with a shape (circle / triangle / square). */
export function ChipShape({
  team,
  locked = false,
  size = '72%',
}: {
  team: TeamId;
  locked?: boolean;
  size?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`chip-${team}`}
      aria-hidden="true"
    >
      {locked && (
        <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="6" />
      )}
      {team === 0 && <circle cx="50" cy="50" r={locked ? 33 : 40} fill="currentColor" />}
      {team === 1 && (
        <polygon points={locked ? '50,20 80,72 20,72' : '50,12 88,80 12,80'} fill="currentColor" />
      )}
      {team === 2 &&
        (locked ? (
          <rect x="24" y="24" width="52" height="52" rx="4" fill="currentColor" />
        ) : (
          <rect x="15" y="15" width="70" height="70" rx="6" fill="currentColor" />
        ))}
    </svg>
  );
}

export function TeamGlyph({ team, className = '' }: { team: TeamId; className?: string }) {
  return (
    <span className={`inline-flex h-4 w-4 items-center justify-center ${className}`}>
      <ChipShape team={team} size="100%" />
    </span>
  );
}
