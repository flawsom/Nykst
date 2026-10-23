import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Zero-dependency WebGL2 Fluid & Hexagonal AST Lattice Background Canvas.
 *
 * - Renders a smooth GPU curl-noise velocity field in Nykst's signature palette
 *   (#06110f deep obsidian, #0b141b slate, #2DD4BF teal, #5EEAD4 mint cyan, #60A5FA electric blue)
 *   that ripples around the cursor (u_mouse, u_velocity, u_time).
 * - Projects an interactive 3D hexagonal AST prism lattice that rotates with mouse
 *   parallax and morphs/zooms with scroll progress (u_scroll).
 * - Automatically pauses via IntersectionObserver and document.visibilitychange,
 *   disposes WebGL resources on unmount, guards against SSR, honors prefers-reduced-motion,
 *   and falls back cleanly if WebGL2 is unavailable.
 */

const VERTEX_SHADER = `#version 300 es
precision highp float;
in vec2 a_position;
out vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec2 u_velocity;
uniform float u_time;
uniform float u_scroll;
uniform float u_intensity;

// Simplex-inspired 2D hash & gradient noise
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(dot(hash2(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
        dot(hash2(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
    mix(dot(hash2(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
        dot(hash2(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// Curl-like domain warp for fluid flow
vec2 fluidField(vec2 p, float t) {
  float n1 = noise(p * 1.45 + vec2(t * 0.12, -t * 0.09));
  float n2 = noise(p * 2.10 - vec2(t * 0.08, t * 0.14) + n1 * 0.65);
  return vec2(n1, n2);
}

// Hexagonal AST prism distance in 2D projected space
float hexPrismWire(vec2 p, float scale) {
  p *= scale;
  const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
  p = abs(p);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * 0.5, k.z * 0.5), 0.5);
  float d = length(p) * sign(p.y);
  return smoothstep(0.035, 0.0, abs(d));
}

void main() {
  vec2 uv = v_uv;
  float aspect = u_resolution.x / max(u_resolution.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 m = (u_mouse - 0.5) * vec2(aspect, 1.0);

  // Cursor fluid wake
  float dist = length(p - m);
  float wake = exp(-dist * 3.8) * (0.35 + min(length(u_velocity) * 2.2, 0.85));
  vec2 flow = fluidField(p + m * 0.18 + u_velocity * 0.12 * exp(-dist * 2.4), u_time);

  // 3D perspective rotation for hexagonal AST lattice
  float angle = u_time * 0.09 + (m.x * 0.35) + u_scroll * 0.9;
  float ca = cos(angle);
  float sa = sin(angle);
  mat2 rot = mat2(ca, -sa, sa, ca);
  vec2 latticeUv = rot * (p + flow * 0.14) * mix(1.0, 0.68, clamp(u_scroll, 0.0, 1.0));
  float hexOuter = hexPrismWire(latticeUv, 3.2);
  float hexInner = hexPrismWire(latticeUv * 1.65 + flow * 0.08, 4.6) * 0.55;
  float prismMask = exp(-length(p - vec2(0.22 * aspect, 0.08)) * 1.65);

  // Nykst signature palette
  vec3 obsidian = vec3(0.024, 0.067, 0.059);   // #06110f
  vec3 slate    = vec3(0.043, 0.078, 0.106);   // #0b141b
  vec3 teal     = vec3(0.176, 0.831, 0.749);   // #2DD4BF
  vec3 mint     = vec3(0.369, 0.918, 0.831);   // #5EEAD4
  vec3 electric = vec3(0.376, 0.647, 0.980);   // #60A5FA

  float ribbon = smoothstep(-0.45, 0.65, flow.x + flow.y * 0.6);
  vec3 base = mix(obsidian, slate, clamp(uv.y * 0.9 + ribbon * 0.35, 0.0, 1.0));
  vec3 fluidGlow = mix(teal, electric, clamp(flow.y * 0.5 + 0.5 + u_scroll * 0.3, 0.0, 1.0));

  vec3 color = base;
  color += fluidGlow * (ribbon * 0.12 + wake * 0.22) * u_intensity;
  color += mix(teal, mint, 0.5) * (hexOuter + hexInner) * prismMask * 0.16 * u_intensity;

  // Subtle film grain inside the shader
  float grain = fract(sin(dot(uv * u_resolution, vec2(12.9898, 78.233)) + u_time) * 43758.5453);
  color += (grain - 0.5) * 0.018;

  fragColor = vec4(color, 0.92);
}
`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function WebGLFieldCanvas({
  className,
  intensity = 1,
  fixed = true,
}: {
  className?: string;
  intensity?: number;
  fixed?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let gl: WebGL2RenderingContext | null = null;
    try {
      gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "low-power",
      });
    } catch {
      gl = null;
    }

    if (!gl) {
      setFallback(true);
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = gl.createProgram();
    if (!vs || !fs || !program) {
      setFallback(true);
      return;
    }

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      setFallback(true);
      return;
    }

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const posLoc = gl.getAttribLocation(program, "a_position");
    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uMouse = gl.getUniformLocation(program, "u_mouse");
    const uVel = gl.getUniformLocation(program, "u_velocity");
    const uTime = gl.getUniformLocation(program, "u_time");
    const uScroll = gl.getUniformLocation(program, "u_scroll");
    const uIntensity = gl.getUniformLocation(program, "u_intensity");

    let mouseX = 0.5;
    let mouseY = 0.65;
    let targetX = 0.5;
    let targetY = 0.65;
    let velX = 0;
    let velY = 0;
    let scrollNorm = 0;
    let visible = true;
    let rafId = 0;
    const startTime = performance.now();

    const resize = () => {
      if (!canvas || !gl) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
    };

    resize();

    const onPointer = (e: PointerEvent) => {
      const nx = e.clientX / Math.max(window.innerWidth, 1);
      const ny = 1.0 - e.clientY / Math.max(window.innerHeight, 1);
      velX = (nx - targetX) * 14;
      velY = (ny - targetY) * 14;
      targetX = nx;
      targetY = ny;
    };

    const onScroll = () => {
      scrollNorm = Math.min(1.5, window.scrollY / Math.max(window.innerHeight, 1));
    };

    const renderFrame = (now: number) => {
      rafId = 0;
      if (!gl || !visible || document.hidden) return;
      resize();
      mouseX += (targetX - mouseX) * 0.08;
      mouseY += (targetY - mouseY) * 0.08;
      velX *= 0.9;
      velY *= 0.9;

      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform2f(uMouse, mouseX, mouseY);
      gl.uniform2f(uVel, velX, velY);
      gl.uniform1f(uTime, reducedMotion ? 0 : (now - startTime) * 0.001);
      gl.uniform1f(uScroll, scrollNorm);
      gl.uniform1f(uIntensity, intensity);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (!reducedMotion) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    const schedule = () => {
      if (!rafId && visible && !document.hidden) {
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    const onVisibility = () => {
      if (document.hidden && rafId) {
        window.cancelAnimationFrame(rafId);
        rafId = 0;
      } else {
        schedule();
      }
    };

    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          visible = entries[0]?.isIntersecting ?? true;
          if (visible) schedule();
          else if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = 0;
          }
        },
        { threshold: 0.01 },
      );
      io.observe(canvas);
    }

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);

    schedule();

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      io?.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      if (gl) {
        gl.deleteBuffer(buffer);
        gl.deleteProgram(program);
        gl.deleteShader(vs);
        gl.deleteShader(fs);
      }
    };
  }, [intensity]);

  return (
    <div
      aria-hidden="true"
      data-testid="webgl-field-container"
      className={cn(
        "pointer-events-none inset-0 z-0 overflow-hidden",
        fixed ? "fixed" : "absolute",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        data-testid="webgl-field-canvas"
        data-webgl-ready={fallback ? "fallback" : "webgl2"}
        className="block h-full w-full opacity-75"
        style={
          fallback
            ? {
                background:
                  "radial-gradient(circle at 50% 22%, rgba(45, 212, 191, 0.16), rgba(6, 17, 15, 0.94) 68%)",
              }
            : undefined
        }
      />
      <div className="film-grain pointer-events-none absolute inset-0 opacity-25" />
    </div>
  );
}
