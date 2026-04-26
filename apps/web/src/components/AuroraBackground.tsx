'use client';

import { motion } from 'framer-motion';

/**
 * Soft, animated aurora background painted behind the entire app shell.
 * Lives behind everything (z-index -1) and ignores pointer events.
 */
export default function AuroraBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-gradient-aurora"
    >
      <motion.div
        className="orb -left-32 -top-32 h-[420px] w-[420px] bg-brand-300/55"
        animate={{ y: [0, 24, 0], x: [0, 16, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="orb right-[-120px] top-32 h-[480px] w-[480px] bg-fuchsia-300/40"
        animate={{ y: [0, -22, 0], x: [0, -14, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="orb bottom-[-160px] left-1/3 h-[520px] w-[520px] bg-cyan-300/35"
        animate={{ y: [0, -18, 0], x: [0, 22, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }}
      />
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")"
        }}
      />
    </div>
  );
}
