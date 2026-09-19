/* eslint-disable react/prop-types */
import type { ReactNode } from 'react'

interface Props {
  id?: string
  title: ReactNode
  trailing?: ReactNode
}

const KokoroSectionHeading: React.FC<Props> = ({ id, title, trailing }) => (
  <div className="flex min-w-0 flex-wrap items-center gap-2">
    <span aria-hidden="true" className="h-4 w-1 shrink-0 rounded-full bg-accent" />
    <h3 id={id} className="min-w-0 font-semibold text-foreground">
      {title}
    </h3>
    {trailing}
  </div>
)

export default KokoroSectionHeading
