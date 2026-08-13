import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'

const vertexShader = `#version 300 es
in vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }
`

const fragmentShader = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform vec2 uMouse;
uniform float uMouseActive;
out vec4 fragColor;

#define TAU 6.28318530718

float glow(float x, float strength, float distance) {
  return distance / pow(max(x, 1e-4), strength);
}

void main() {
  vec2 uv = gl_FragCoord.xy / iResolution.xy;
  float threadCount = 7.0;
  float pinchX = mix(0.5, uMouse.x, 0.42 * uMouseActive);
  float spread = 0.24 * abs(uv.x - pinchX);
  float baseTime = iTime * 0.22;
  float yOffset = uv.y - 0.5;
  vec3 color = vec3(0.0);
  float sum = 0.0;

  for (int index = 0; index < 7; index++) {
    float i = float(index);
    float amplitude = spread * (1.0 + i * 0.22);
    float shimmer = sin(iTime * 1.7 + i * 1.3) * 0.35;
    float mirror = sign(pinchX - uv.x);
    float phase = (baseTime + i * (TAU / threadCount)) * mirror + shimmer;
    float distance = abs(yOffset + sin(uv.x * 5.1 + phase) * amplitude) / 1.08;
    float threadGlow = glow(distance, 0.58, 0.022);
    float mixValue = i / (threadCount - 1.0);
    vec3 threadColor = mix(vec3(0.1137255, 0.3058824, 0.8470588), vec3(0.5607843, 0.6901961, 1.0), mixValue);
    color += threadGlow * threadColor;
    sum += threadGlow;
  }

  color = mix(color, vec3(1.0) * sum, smoothstep(0.5, 2.2, sum) * 0.5);
  vec2 mouseDelta = uv - uMouse;
  float mouseLight = exp(-dot(mouseDelta, mouseDelta) * 7.0) * uMouseActive;
  color *= 0.78 + mouseLight * 0.42;
  float alpha = clamp(sum, 0.0, 1.0) * 0.96;
  float grain = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233)) + iTime) * 43758.5453) - 0.5) * 0.022;
  fragColor = vec4(clamp(color * alpha + grain, 0.0, 1.0), clamp(alpha + grain, 0.0, 1.0));
}
`

export function WebThreads({ className = '' }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    const forcedColorsQuery = window.matchMedia('(forced-colors: active)')
    const mobileQuery = window.matchMedia('(max-width: 47.99rem), (pointer: coarse)')
    if (!container || reducedMotionQuery.matches || forcedColorsQuery.matches || mobileQuery.matches) return

    let renderer: Renderer
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 1.5),
      })
    } catch {
      return
    }

    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.setAttribute('aria-hidden', 'true')
    container.appendChild(canvas)

    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uMouseActive: { value: 0 },
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    const resize = () => {
      const { width, height } = container.getBoundingClientRect()
      renderer.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)))
      const resolution = program.uniforms.iResolution.value as Float32Array
      resolution[0] = gl.drawingBufferWidth
      resolution[1] = gl.drawingBufferHeight
      renderer.render({ scene: mesh })
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    let animationFrame = 0
    let isVisible = true
    let isPageVisible = !document.hidden
    let effectsAllowed = true
    const startedAt = performance.now()
    const currentMouse = [0.5, 0.5]
    const targetMouse = [0.5, 0.5]
    let currentMouseActive = 0
    let targetMouseActive = 0
    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect()
      targetMouse[0] = (event.clientX - rect.left) / Math.max(rect.width, 1)
      targetMouse[1] = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1)
      targetMouseActive = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom ? 1 : 0
    }
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    const render = (time: number) => {
      program.uniforms.iTime.value = (time - startedAt) * 0.001
      currentMouse[0] += (targetMouse[0] - currentMouse[0]) * 0.06
      currentMouse[1] += (targetMouse[1] - currentMouse[1]) * 0.06
      currentMouseActive += (targetMouseActive - currentMouseActive) * 0.06
      const mouse = program.uniforms.uMouse.value as Float32Array
      mouse[0] = currentMouse[0]
      mouse[1] = currentMouse[1]
      program.uniforms.uMouseActive.value = currentMouseActive
      renderer.render({ scene: mesh })
      animationFrame = requestAnimationFrame(render)
    }
    const start = () => {
      if (effectsAllowed && isVisible && isPageVisible && animationFrame === 0) animationFrame = requestAnimationFrame(render)
    }
    const stop = () => {
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }
    const handleAccessibilityPreference = () => {
      effectsAllowed = !reducedMotionQuery.matches && !forcedColorsQuery.matches && !mobileQuery.matches
      if (effectsAllowed) start()
      else stop()
    }
    reducedMotionQuery.addEventListener('change', handleAccessibilityPreference)
    forcedColorsQuery.addEventListener('change', handleAccessibilityPreference)
    mobileQuery.addEventListener('change', handleAccessibilityPreference)
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting
      if (isVisible) start()
      else stop()
    })
    intersectionObserver.observe(container)
    const handleVisibilityChange = () => {
      isPageVisible = !document.hidden
      if (isPageVisible) start()
      else stop()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    start()

    return () => {
      stop()
      resizeObserver.disconnect()
      intersectionObserver.disconnect()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      reducedMotionQuery.removeEventListener('change', handleAccessibilityPreference)
      forcedColorsQuery.removeEventListener('change', handleAccessibilityPreference)
      mobileQuery.removeEventListener('change', handleAccessibilityPreference)
      window.removeEventListener('pointermove', handlePointerMove)
      canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [])

  return <div ref={containerRef} className={`web-threads ${className}`.trim()} aria-hidden="true" />
}
