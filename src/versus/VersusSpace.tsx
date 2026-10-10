import { useEffect, useRef } from "react";

/** A static, deterministic continuation of the galaxy sky. No WebGL dependency
 * or render loop is needed while two people concentrate on a question. */
export function VersusSpace() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const context = canvas.getContext("2d");
    if (!context) return;
    const draw = () => {
      const width = innerWidth, height = innerHeight;
      const scale = Math.min(devicePixelRatio || 1, 2);
      canvas.width = width * scale;
      canvas.height = height * scale;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      let seed = 8721;
      const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
      for (let i = 0; i < Math.min(240, width * height / 5500); i++) {
        const x = random() * width, y = random() * height;
        const radius = .35 + random() * .8;
        context.fillStyle = `rgba(160, 182, 224, ${.12 + random() * .4})`;
        context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill();
      }
      context.strokeStyle = "rgba(82, 108, 183, .12)";
      for (const radius of [260, 390, 560]) {
        context.beginPath();
        context.ellipse(width * .73, height * .38, radius, radius * .45, -.36, 0, Math.PI * 2);
        context.stroke();
      }
    };
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, []);
  return <canvas className="versus-space" ref={ref} aria-hidden="true" />;
}
