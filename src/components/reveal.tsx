"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Reveal — subtilna scroll-reveal animacija (fade + dvig).
 *
 * Raziskava P4-5: najboljše platforme (Airbnb, GYG) uporabljajo
 * subtilne micro-interactions — nikoli vsiljive. Enkraten trigger
 * (once), kratka dura (0.6s), spoštovanje prefers-reduced-motion.
 *
 * Uporaba: <Reveal delay={100}><ServerComponent /></Reveal>
 */
export function Reveal({
  children,
  delay = 0,
  y = 24,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-64px" }}
      transition={{ duration: 0.6, delay: delay / 1000, ease: [0.21, 0.47, 0.32, 0.98] }}
    >
      {children}
    </motion.div>
  );
}

export default Reveal;
