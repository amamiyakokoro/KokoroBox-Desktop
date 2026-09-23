import { Link } from 'react-router-dom'
import { tr } from '../../../../shared/i18n'
import KokoroBoxIcon from './kokorobox-icon'

export function KokoroBrandLink({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      to="/"
      aria-label={tr('Home')}
      className={
        compact
          ? 'app-nodrag flex size-10 items-center justify-center rounded-lg text-foreground transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent'
          : 'app-nodrag ml-2 flex items-center gap-2 rounded-lg px-1 transition-colors hover:bg-surface-secondary focus-visible:outline-2 focus-visible:outline-accent'
      }
    >
      <KokoroBoxIcon className={compact ? 'size-7' : 'size-7 shrink-0'} />
      {!compact && <span className="text-lg font-bold leading-8">KokoroBox</span>}
    </Link>
  )
}

export default KokoroBrandLink
