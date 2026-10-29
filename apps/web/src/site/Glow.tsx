import { useEffect, useRef } from 'react';

// The site's background glow: three colour blobs that drift on their own, a fourth that follows the pointer,
// and a slight parallax shift of the rest. Only transforms change, it pauses off-screen, and it stays still
// for people who ask for reduced motion.
export function Glow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = ref.current;
    if (!glow || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const visible = new IntersectionObserver(([entry]) => glow.classList.toggle('paused', !entry!.isIntersecting));
    visible.observe(glow);

    let frame = 0;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = glow.getBoundingClientRect();
        const x = e.clientX - box.left;
        const y = e.clientY - box.top;
        glow.style.setProperty('--mx', `${x}px`);
        glow.style.setProperty('--my', `${y}px`);
        // -1..1 across the glow, for the parallax.
        glow.style.setProperty('--px', (x / box.width - 0.5).toFixed(3));
        glow.style.setProperty('--py', (y / box.height - 0.5).toFixed(3));
        glow.classList.add('tracking');
      });
    };
    const onLeave = () => glow.classList.remove('tracking');
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      visible.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className="s-glow" ref={ref} aria-hidden="true">
      <div className="s-glow-layer">
        <i className="s-blob s-blob-1" />
        <i className="s-blob s-blob-2" />
        <i className="s-blob s-blob-3" />
      </div>
      <i className="s-blob s-blob-cursor" />
    </div>
  );
}
