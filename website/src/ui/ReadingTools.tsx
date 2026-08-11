import { useEffect, useState } from 'react'
import { slugHeading } from './toc-model'
import type { TocItem } from './toc-model'

function isLongFormPath(pathname: string) {
  if (pathname === '/blog/ai-crawler-audit-500-companies/') return false

  return pathname.startsWith('/docs/') ||
    (/^\/blog\/[^/]+\/$/.test(pathname) && pathname !== '/blog/') ||
    pathname === '/terms/' ||
    pathname === '/privacy/' ||
    pathname === '/license/'
}

export function ReadingTools() {
  const [items, setItems] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState('')
  const [progress, setProgress] = useState(0)
  const [tocOpen, setTocOpen] = useState(false)
  const [tocVisible, setTocVisible] = useState(true)

  useEffect(() => {
    const media = window.matchMedia('(min-width: 82.01rem)')
    const syncWithViewport = () => setTocOpen(media.matches)
    syncWithViewport()
    media.addEventListener('change', syncWithViewport)
    return () => media.removeEventListener('change', syncWithViewport)
  }, [])

  useEffect(() => {
    if (!isLongFormPath(window.location.pathname)) return () => {}
    const root = document.querySelector<HTMLElement>('.doc-page')
    if (!root) return () => {}

    const used = new Map<string, number>()
    const headings = Array.from(root.querySelectorAll<HTMLHeadingElement>('h2, h3'))
    const nextItems = headings.map((heading) => {
      const base = heading.id || slugHeading(heading.textContent?.trim() || 'section')
      const duplicate = used.get(base) ?? 0
      used.set(base, duplicate + 1)
      const id = duplicate ? `${base}-${duplicate + 1}` : base
      heading.id = id
      return { id, label: heading.textContent?.trim() || 'Section', level: Number(heading.tagName.slice(1)) as 2 | 3 }
    })
    const itemsFrame = requestAnimationFrame(() => setItems(nextItems))

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
      if (visible) setActiveId(visible.target.id)
    }, { rootMargin: '-18% 0px -68% 0px' })
    headings.forEach((heading) => observer.observe(heading))

    let frame = 0
    const updateProgress = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const top = root.getBoundingClientRect().top + window.scrollY
        const length = Math.max(root.scrollHeight - window.innerHeight, 1)
        setProgress(Math.max(0, Math.min(100, ((window.scrollY - top) / length) * 100)))
        const tocBottom = document.querySelector<HTMLElement>('.reading-tools')?.getBoundingClientRect().bottom ?? 0
        const footerTop = document.querySelector<HTMLElement>('.site-footer')?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY
        setTocVisible(root.getBoundingClientRect().bottom > tocBottom + 32 && footerTop > tocBottom + 32)
      })
    }
    updateProgress()
    window.addEventListener('scroll', updateProgress, { passive: true })
    window.addEventListener('resize', updateProgress)

    return () => {
      headings.forEach((heading) => observer.unobserve(heading))
      observer.disconnect()
      cancelAnimationFrame(itemsFrame)
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', updateProgress)
      window.removeEventListener('resize', updateProgress)
    }
  }, [])

  if (items.length < 2) return null

  return (
    <>
      <div className="reading-progress" aria-hidden="true">
        <span style={{ transform: `scaleX(${progress / 100})` }} />
      </div>
      <nav className={`reading-tools${tocVisible ? '' : ' is-past-reading'}`} aria-label="On this page">
        <details open={tocOpen} onToggle={(event) => setTocOpen(event.currentTarget.open)}>
          <summary>On this page <span>{Math.round(progress)}%</span></summary>
          <ol>
            {items.map((item) => (
              <li className={`toc-level-${item.level}`} key={item.id}>
                <a href={`#${item.id}`} aria-current={activeId === item.id ? 'location' : undefined}>{item.label}</a>
              </li>
            ))}
          </ol>
        </details>
      </nav>
    </>
  )
}
