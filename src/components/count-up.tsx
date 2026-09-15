"use client";

import { useEffect, useRef, useState } from "react";
import { useInView, useReducedMotion } from "framer-motion";

/**
 * CountUp — animirano štetje števil ob scroll-u v pogled.
 *
 * Pattern iz raziskave P4-5: dinamične številke dvigujejo zaznano
 * živost strani (micro-interaction). Spoštuje prefers-reduced-motion
 * (takoj prikaže končno vrednost) in formatting (decimalna mesta,
 * ločila tisočic po slovenski/inti konvenciji).
 */
export function CountUp({
  value,
  decimals = 0,
  durationMs = 1400,
  suffix = "",
  prefix = "",
  className,
}: {
  value: number;
  decimals?: number;
  durationMs?: number;
  suffix?: string;
  prefix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView || reduceMotion) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      // easeOutExpo — hiter start, mehak pristop
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, durationMs, reduceMotion]);

  // Reduced-motion: končna vrednost takoj (brez animacije, brez setState v efektu)
  const finalValue = reduceMotion ? value : display;

  const formatted = finalValue.toLocaleString("sl-SI", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span ref={ref} className={className}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

export default CountUp;
