import { useEffect, useRef } from 'react';

// The site's background glow: five colour blobs that wander across it on long orbits, plus one that follows the
// pointer, blurred together so they flow into each other. It pauses off-screen and stays still for people who ask
// for reduced motion. (An SVG "goo" filter would merge them more like liquid, but Chrome renders it on the CPU and
// drops to under one frame a second at this size.)
export function Glow() {
  const ref = useRef<HTMLDivElement>(null);
  const pointer = useRef<HTMLElement>(null);

  useEffect(() => {
    const glow = ref.current;
    const blob = pointer.current;
    if (!glow || !blob || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let onScreen = true;
    const visible = new IntersectionObserver(([entry]) => {
      onScreen = entry!.isIntersecting;
      glow.classList.toggle('paused', !onScreen);
    });
    visible.observe(glow);

    // The pointer blob eases toward the pointer: each frame it covers a twentieth of the remaining distance.
    const at = { x: 0, y: 0 };
    const target = { x: 0, y: 0 };
    let frame = 0;
    const step = () => {
      at.x += (target.x - at.x) / 20;
      at.y += (target.y - at.y) / 20;
      blob.style.transform = `translate3d(${at.x}px, ${at.y}px, 0)`;
      frame = Math.abs(target.x - at.x) + Math.abs(target.y - at.y) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' || !onScreen) return;
      const box = glow.getBoundingClientRect();
      // The blob is centred on the glow's top-left corner, so it moves by the pointer's offset from there.
      target.x = e.clientX - box.left;
      target.y = e.clientY - box.top;
      if (!glow.classList.contains('tracking')) {
        Object.assign(at, target); // appear where the pointer is instead of sliding in from the centre
        glow.classList.add('tracking');
      }
      if (!frame) frame = requestAnimationFrame(step);
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
      <div className="s-blobs">
        <i className="s-blob s-blob-1" />
        <i className="s-blob s-blob-2" />
        <i className="s-blob s-blob-3" />
        <i className="s-blob s-blob-4" />
        <i className="s-blob s-blob-5" />
        <i className="s-blob s-blob-pointer" ref={pointer} />
      </div>
    </div>
  );
}
