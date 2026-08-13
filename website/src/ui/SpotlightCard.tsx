import { useRef, type HTMLAttributes } from 'react'

type SpotlightCardProps = HTMLAttributes<HTMLDivElement> & {
  tone?: 'brand' | 'info' | 'neutral'
}
export function SpotlightCard({
  children,
  className = '',
  tone = 'brand',
  onPointerMove,
  ...props
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)

  return (
    <div
      {...props}
      ref={cardRef}
      className={`spotlight-card spotlight-card-${tone} ${className}`.trim()}
      onPointerMove={(event) => {
        const card = cardRef.current
        if (card && event.pointerType !== 'touch') {
          const rect = card.getBoundingClientRect()
          card.style.setProperty('--spotlight-x', `${event.clientX - rect.left}px`)
          card.style.setProperty('--spotlight-y', `${event.clientY - rect.top}px`)
        }
        onPointerMove?.(event)
      }}
    >
      {children}
    </div>
  )
}
