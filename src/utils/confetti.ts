type ConfettiOptions = {
  particleCount?: number;
  spread?: number;
  origin?: { x?: number; y?: number };
};

/**
 * Small dependency-free celebration effect.
 * It keeps the existing reward moments lively without coupling the game to a
 * third-party canvas package that may not be present in an offline build.
 */
export default function confetti(options: ConfettiOptions = {}) {
  if (typeof document === 'undefined') return;

  const count = Math.min(options.particleCount ?? 48, 140);
  const spread = options.spread ?? 55;
  const originX = (options.origin?.x ?? 0.5) * window.innerWidth;
  const originY = (options.origin?.y ?? 0.52) * window.innerHeight;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = [
    'position:fixed',
    'inset:0',
    'z-index:100',
    'pointer-events:none',
    'overflow:hidden',
  ].join(';');

  const colors = ['#67e8f9', '#f5c96a', '#a9a1ff', '#fb8ea8', '#d7f9ff'];
  for (let index = 0; index < count; index += 1) {
    const particle = document.createElement('i');
    const angle = (Math.random() - 0.5) * spread;
    const distance = 90 + Math.random() * 260;
    const rotation = Math.random() * 540 - 270;
    const duration = 780 + Math.random() * 700;
    particle.style.cssText = [
      'position:absolute',
      `left:${originX}px`,
      `top:${originY}px`,
      `width:${4 + Math.random() * 5}px`,
      `height:${7 + Math.random() * 7}px`,
      `border-radius:${Math.random() > 0.5 ? '2px' : '50%'}`,
      `background:${colors[index % colors.length]}`,
      'opacity:.95',
      `transform:rotate(${Math.random() * 180}deg)`,
      `animation:star-confetti ${duration}ms cubic-bezier(.18,.72,.3,1) forwards`,
      `--confetti-x:${Math.sin(angle) * distance}px`,
      `--confetti-y:${Math.cos(angle) * distance + 150}px`,
      `--confetti-r:${rotation}deg`,
    ].join(';');
    layer.appendChild(particle);
  }

  if (!document.getElementById('star-confetti-style')) {
    const style = document.createElement('style');
    style.id = 'star-confetti-style';
    style.textContent = `
      @keyframes star-confetti {
        0% { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg); }
        100% { opacity: 0; transform: translate3d(var(--confetti-x), var(--confetti-y), 0) rotate(var(--confetti-r)); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 1600);
}