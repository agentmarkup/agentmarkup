import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'

const vertexShader = `#version 300 es
in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragmentShader = `#version 300 es
precision highp float;

uniform vec2 iResolution;
uniform float iTime;
uniform vec2 uMouse;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
out vec4 fragColor;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  const float speed = 0.45;
  const float scale = 3.7;
  const float detail = 2.0;
  const float glow = 1.65;
  const float coreSize = 0.15;
  const float swirl = 1.4;
  const float fold = -0.32;
  const float blackPoint = 0.05;
  const float brightness = 0.5;
  const float mouseStrength = 0.3;
  const float grainIntensity = 0.05;
  float time = iTime * speed;
  vec2 p = scale * ((gl_FragCoord.xy - 0.5 * iResolution.xy) / iResolution.y) - 0.5;
  p += (uMouse - 0.5) * mouseStrength * 2.0;

  vec2 i = p;
  float c = 0.0;
  float r = length(p + vec2(sin(time), sin(time * 0.3 + 5.0)) * 0.5);
  float d = length(p);
  float rot = d + time + p.x * swirl;
  float cosRot = cos(rot);
  mat2 warp = mat2(cos(rot - sin(time / 5.0)), sin(rot), -sin(cosRot - time), cosRot) * fold;
  float glowCore = glow * coreSize;

  for (float n = 0.0; n < 8.0; n++) {
    if (n >= detail) break;
    p *= warp;
    float t = r - time / (n + 3.0);
    i -= p + vec2(cos(t - i.x - r) + sin(t + i.y), sin(t - i.y) + cos(t + i.x) + r);
    c += glowCore / length(vec2(sin(i.x + t), cos(i.y + t)));
  }

  c /= 6.0;
  float g = clamp(max(c - blackPoint, 0.0) * brightness, 0.0, 1.0);
  vec3 color = mix(uColor1, uColor2, smoothstep(0.0, 0.5, g));
  color = mix(color, uColor3, smoothstep(0.5, 1.0, g));

  float grain = hash(gl_FragCoord.xy + iTime);
  float alpha = clamp(g + (grain - 0.5) * grainIntensity, 0.0, 1.0);
  fragColor = vec4(color * alpha, alpha);
}
`

export function SiteMoltenMetal({ theme }: { theme: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // A full-viewport WebGL shader is disproportionately expensive on phones.
    // Mobile keeps the same dark/light surface through CSS without blocking input.
    const useStaticBackground = window.matchMedia(
      '(max-width: 767px), (pointer: coarse), (prefers-reduced-motion: reduce)',
    ).matches
    if (useStaticBackground) return

    let renderer: Renderer
    try {
      renderer = new Renderer({
        webgl: 2,
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        dpr: Math.min(window.devicePixelRatio || 1, 2),
      })
    } catch {
      return
    }

    const gl = renderer.gl
    gl.clearColor(0, 0, 0, 0)
    const canvas = gl.canvas as HTMLCanvasElement
    canvas.setAttribute('aria-hidden', 'true')
    container.appendChild(canvas)

    const isLight = theme === 'light'
    const program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        iTime: { value: 0 },
        iResolution: { value: new Float32Array([1, 1]) },
        uMouse: { value: new Float32Array([0.5, 0.5]) },
        uColor1: { value: isLight ? new Float32Array([0, 0, 0]) : new Float32Array([0.078, 0.216, 0.62]) },
        uColor2: { value: isLight ? new Float32Array([0.1411765, 0.1411765, 0.1411765]) : new Float32Array([0.31, 0.486, 1]) },
        uColor3: { value: isLight ? new Float32Array([0.1294118, 0.1294118, 0.1294118]) : new Float32Array([0.72, 0.82, 1]) },
      },
    })
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      const resolution = program.uniforms.iResolution.value as Float32Array
      resolution[0] = gl.drawingBufferWidth
      resolution[1] = gl.drawingBufferHeight
      renderer.render({ scene: mesh })
    }

    const targetMouse = new Float32Array([0.5, 0.5])
    const currentMouse = program.uniforms.uMouse.value as Float32Array
    const handlePointerMove = (event: PointerEvent) => {
      targetMouse[0] = event.clientX / window.innerWidth
      targetMouse[1] = 1 - event.clientY / window.innerHeight
    }
    const handlePointerLeave = () => {
      targetMouse[0] = 0.5
      targetMouse[1] = 0.5
    }

    let animationFrame = 0
    const startedAt = performance.now()

    const render = (time: number) => {
      program.uniforms.iTime.value = (time - startedAt) * 0.001
      currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0])
      currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1])
      renderer.render({ scene: mesh })
      animationFrame = requestAnimationFrame(render)
    }
    const start = () => {
      if (!document.hidden && animationFrame === 0) {
        animationFrame = requestAnimationFrame(render)
      }
    }
    const stop = () => {
      if (animationFrame !== 0) cancelAnimationFrame(animationFrame)
      animationFrame = 0
    }
    const handleVisibilityChange = () => {
      if (document.hidden) stop()
      else start()
    }

    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    document.documentElement.addEventListener('pointerleave', handlePointerLeave)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    resize()
    start()

    return () => {
      stop()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', handlePointerMove)
      document.documentElement.removeEventListener('pointerleave', handlePointerLeave)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      canvas.remove()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, [theme])

  return <div ref={containerRef} className="site-molten-metal" aria-hidden="true" />
}
