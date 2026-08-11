import { useCallback, useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'

type SvgChannel = 'R' | 'G' | 'B' | 'A'

type GlassSurfaceProps = {
  children: ReactNode
  className?: string
  width?: number | string
  height?: number | string
  borderRadius?: number
  borderWidth?: number
  brightness?: number
  opacity?: number
  blur?: number
  displace?: number
  saturation?: number
  distortionScale?: number
  redOffset?: number
  greenOffset?: number
  blueOffset?: number
  xChannel?: SvgChannel
  yChannel?: SvgChannel
  mixBlendMode?: CSSProperties['mixBlendMode']
  style?: CSSProperties
}

type GlassStyle = CSSProperties & {
  '--glass-saturation': number
  '--glass-filter': string
}

function supportsSvgBackdropFilter(filterId: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent)
  const isFirefox = /Firefox/.test(navigator.userAgent)
  if (isSafari || isFirefox) return false

  const probe = document.createElement('div')
  probe.style.backdropFilter = `url(#${filterId})`
  return probe.style.backdropFilter !== ''
}

export function GlassSurface({
  children,
  className = '',
  width = '100%',
  height = '100%',
  borderRadius = 20,
  borderWidth = 0.07,
  brightness = 54,
  opacity = 0.9,
  blur = 11,
  displace = 0.6,
  saturation = 1.35,
  distortionScale = -84,
  redOffset = 0,
  greenOffset = 8,
  blueOffset = 16,
  xChannel = 'R',
  yChannel = 'G',
  mixBlendMode = 'difference',
  style,
}: GlassSurfaceProps) {
  const uniqueId = useId().replace(/:/g, '-')
  const filterId = `glass-filter-${uniqueId}`
  const redGradientId = `glass-red-${uniqueId}`
  const blueGradientId = `glass-blue-${uniqueId}`
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<SVGFEImageElement>(null)

  const updateDisplacementMap = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect()
    const actualWidth = Math.max(1, Math.round(rect?.width ?? 400))
    const actualHeight = Math.max(1, Math.round(rect?.height ?? 80))
    const edgeSize = Math.min(actualWidth, actualHeight) * borderWidth * 0.5
    const innerWidth = Math.max(1, actualWidth - edgeSize * 2)
    const innerHeight = Math.max(1, actualHeight - edgeSize * 2)
    const svg = `
      <svg viewBox="0 0 ${actualWidth} ${actualHeight}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="${redGradientId}" x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="red"/>
          </linearGradient>
          <linearGradient id="${blueGradientId}" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#0000"/><stop offset="100%" stop-color="blue"/>
          </linearGradient>
        </defs>
        <rect width="${actualWidth}" height="${actualHeight}" fill="black"/>
        <rect width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${redGradientId})"/>
        <rect width="${actualWidth}" height="${actualHeight}" rx="${borderRadius}" fill="url(#${blueGradientId})" style="mix-blend-mode:${mixBlendMode}"/>
        <rect x="${edgeSize}" y="${edgeSize}" width="${innerWidth}" height="${innerHeight}" rx="${borderRadius}" fill="hsl(0 0% ${brightness}% / ${opacity})" style="filter:blur(${blur}px)"/>
      </svg>`
    const nextUrl = `data:image/svg+xml,${encodeURIComponent(svg)}`
    imageRef.current?.setAttribute('href', nextUrl)
  }, [blueGradientId, blur, borderRadius, borderWidth, brightness, mixBlendMode, opacity, redGradientId])

  useEffect(() => {
    const container = containerRef.current
    const svgSupported = supportsSvgBackdropFilter(filterId)
    container?.classList.toggle('glass-surface-svg', svgSupported)
    container?.classList.toggle('glass-surface-fallback', !svgSupported)
    updateDisplacementMap()

    if (!container || typeof ResizeObserver === 'undefined') return
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateDisplacementMap)
    })
    observer.observe(container)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [filterId, updateDisplacementMap])

  const containerStyle: GlassStyle = {
    ...style,
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
    borderRadius: `${borderRadius}px`,
    '--glass-saturation': saturation,
    '--glass-filter': `url(#${filterId})`,
  }

  return (
    <div
      ref={containerRef}
      className={`glass-surface glass-surface-fallback ${className}`.trim()}
      style={containerStyle}
    >
      <svg className="glass-surface-filter" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage ref={imageRef} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortionScale + redOffset} xChannelSelector={xChannel} yChannelSelector={yChannel} result="dispRed" />
            <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortionScale + greenOffset} xChannelSelector={xChannel} yChannelSelector={yChannel} result="dispGreen" />
            <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={distortionScale + blueOffset} xChannelSelector={xChannel} yChannelSelector={yChannel} result="dispBlue" />
            <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
            <feBlend in="red" in2="green" mode="screen" result="redGreen" />
            <feBlend in="redGreen" in2="blue" mode="screen" result="output" />
            <feGaussianBlur in="output" stdDeviation={displace} />
          </filter>
        </defs>
      </svg>
      <div className="glass-surface-content">{children}</div>
    </div>
  )
}
