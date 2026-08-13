import type { ReactNode } from 'react'

export function ResponsiveTable({ children, label = 'Scrollable data table' }: { children: ReactNode; label?: string }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      <table className="doc-table">{children}</table>
    </div>
  )
}
