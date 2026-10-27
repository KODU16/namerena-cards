// 技能特效：canvas 粒子层。每个技能一套颜色/形状/扩散参数。
const SKILL_FX = {
  sklfire: { c: '#ff7a3c', c2: '#ffd08a', n: 70, shape: 'spark', speed: 7, spread: 1.6, size: 4, gravity: -0.02 },
  sklice: { c: '#8fd8ff', c2: '#e8f8ff', n: 48, shape: 'flake', speed: 3.2, spread: 1.2, size: 6, gravity: 0.03 },
  sklthunder: { c: '#ffe066', c2: '#fffbe0', n: 40, shape: 'spark', speed: 10, spread: 0.4, size: 3, gravity: 0.04 },
  sklquake: { c: '#c98a4b', c2: '#e8cba0', n: 60, shape: 'square', speed: 5, spread: 1.9, size: 5, gravity: 0.18 },
  sklabsorb: { c: '#c2344d', c2: '#ff8fa3', n: 45, shape: 'orb', speed: 4, spread: 1.2, size: 5, gravity: 0 },
  sklpoison: { c: '#7bd94b', c2: '#d6ffb0', n: 50, shape: 'orb', speed: 3, spread: 1.5, size: 5, gravity: 0.05 },
  sklrapid: { c: '#ffb27a', c2: '#fff0e0', n: 55, shape: 'spark', speed: 9, spread: 0.7, size: 3, gravity: 0 },
  sklcritical: { c: '#ff4d4d', c2: '#ffe0e0', n: 36, shape: 'ring', speed: 6, spread: 1.1, size: 8, gravity: 0 },
  sklhalf: { c: '#9bd36a', c2: '#eef7c8', n: 42, shape: 'orb', speed: 2.6, spread: 1.7, size: 7, gravity: -0.02 },
  sklexchange: { c: '#b48cff', c2: '#efe4ff', n: 40, shape: 'ring', speed: 4, spread: 1.4, size: 7, gravity: 0 },
  sklberserk: { c: '#ff5e3a', c2: '#ffc2a8', n: 66, shape: 'spark', speed: 8, spread: 1.3, size: 4, gravity: -0.01 },
  sklcharm: { c: '#ff8fc7', c2: '#ffe3f1', n: 44, shape: 'orb', speed: 3.4, spread: 1.5, size: 6, gravity: -0.05 },
  sklhaste: { c: '#7fe0c0', c2: '#e0fff6', n: 50, shape: 'spark', speed: 8, spread: 0.5, size: 3, gravity: 0 },
  sklslow: { c: '#7a9cff', c2: '#dbe6ff', n: 40, shape: 'orb', speed: 2.2, spread: 1.6, size: 6, gravity: 0.06 },
  sklcurse: { c: '#8b5cf6', c2: '#d9c9ff', n: 46, shape: 'square', speed: 3.6, spread: 1.4, size: 5, gravity: -0.03 },
  sklheal: { c: '#63d68b', c2: '#d8ffe6', n: 46, shape: 'leaf', speed: 2.6, spread: 1.3, size: 6, gravity: -0.08 },
  sklrevive: { c: '#f5e6a8', c2: '#fffbe8', n: 44, shape: 'spark', speed: 3, spread: 1.2, size: 4, gravity: -0.1 },
  skldisperse: { c: '#bfefff', c2: '#ffffff', n: 40, shape: 'ring', speed: 4.4, spread: 1.5, size: 6, gravity: 0 },
  skliron: { c: '#d8c27a', c2: '#fff2c8', n: 36, shape: 'square', speed: 2.4, spread: 1.8, size: 6, gravity: 0 },
  sklcharge: { c: '#ffd166', c2: '#fff6d0', n: 48, shape: 'spark', speed: 2.4, spread: 0.6, size: 4, gravity: -0.02 },
  sklaccumulate: { c: '#7ad1ff', c2: '#dff5ff', n: 42, shape: 'orb', speed: 2, spread: 1.0, size: 5, gravity: -0.04 },
  sklassassinate: { c: '#6b7a8f', c2: '#c9d4e0', n: 30, shape: 'spark', speed: 12, spread: 0.3, size: 3, gravity: 0 },
  sklsummon: { c: '#c2344d', c2: '#ffb0bd', n: 52, shape: 'orb', speed: 3.2, spread: 1.9, size: 6, gravity: -0.02 },
  sklclone: { c: '#8fd3ff', c2: '#e6f7ff', n: 40, shape: 'square', speed: 3, spread: 1.4, size: 5, gravity: 0 },
  sklshadow: { c: '#6b5b95', c2: '#c9c0e8', n: 38, shape: 'orb', speed: 2.4, spread: 1.7, size: 7, gravity: -0.03 },
  skldefend: { c: '#e2c06a', c2: '#fff4cc', n: 30, shape: 'ring', speed: 3, spread: 1.2, size: 8, gravity: 0 },
  sklprotect: { c: '#a8d8b9', c2: '#e8fff0', n: 34, shape: 'ring', speed: 2.6, spread: 1.3, size: 7, gravity: 0 },
  sklreflect: { c: '#b9c6ff', c2: '#eef0ff', n: 34, shape: 'ring', speed: 5, spread: 1.2, size: 7, gravity: 0 },
  sklreraise: { c: '#ffd27a', c2: '#fff8e0', n: 30, shape: 'spark', speed: 3.6, spread: 1.0, size: 4, gravity: -0.06 },
  sklshield: { c: '#7fd8ff', c2: '#e0f7ff', n: 38, shape: 'ring', speed: 2.8, spread: 1.4, size: 8, gravity: 0 },
  sklcounter: { c: '#ff9a5c', c2: '#ffe6d0', n: 40, shape: 'spark', speed: 8, spread: 1.0, size: 3, gravity: 0 },
  sklmerge: { c: '#a0522d', c2: '#e0b090', n: 44, shape: 'orb', speed: 2.2, spread: 1.6, size: 7, gravity: 0.04 },
  sklzombie: { c: '#8a9a5b', c2: '#d8e0b8', n: 40, shape: 'square', speed: 2.4, spread: 1.5, size: 6, gravity: 0.05 },
  sklupgrade: { c: '#ff6b6b', c2: '#ffd6d6', n: 44, shape: 'spark', speed: 6, spread: 1.2, size: 4, gravity: -0.02 },
  sklhide: { c: '#9aa7b0', c2: '#e3e9ed', n: 32, shape: 'orb', speed: 2, spread: 1.8, size: 7, gravity: -0.02 },
  normal: { c: '#cfd8e3', c2: '#ffffff', n: 28, shape: 'spark', speed: 6, spread: 0.9, size: 3, gravity: 0 },
};

let canvas = null;
let ctx = null;
let particles = [];
let raf = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.id = 'fx-layer';
  canvas.className = 'fx-layer';
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  if (!canvas) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function drawShape(p) {
  const t = p.life / p.maxLife;
  ctx.globalAlpha = Math.max(0, t);
  ctx.fillStyle = p.color;
  ctx.strokeStyle = p.color;
  const s = p.size * (0.6 + 0.4 * t);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rot);
  switch (p.shape) {
    case 'square':
      ctx.fillRect(-s / 2, -s / 2, s, s);
      break;
    case 'ring':
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.stroke();
      break;
    case 'flake':
      ctx.lineWidth = 1.6;
      for (let i = 0; i < 3; i++) {
        const a = (Math.PI / 3) * i;
        ctx.beginPath();
        ctx.moveTo(-Math.cos(a) * s, -Math.sin(a) * s);
        ctx.lineTo(Math.cos(a) * s, Math.sin(a) * s);
        ctx.stroke();
      }
      break;
    case 'leaf':
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.6, s * 1.2, p.rot, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'spark':
      ctx.beginPath();
      ctx.moveTo(-s * 1.8, 0);
      ctx.lineTo(s * 1.8, 0);
      ctx.lineWidth = 2;
      ctx.stroke();
      break;
    default:
      ctx.beginPath();
      ctx.arc(0, 0, s, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}

function tick() {
  if (!ctx) return;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  for (const p of particles) {
    p.life -= 1;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.gravity;
    p.vx *= 0.99;
    p.rot += p.vr;
    if (p.life > 0) drawShape(p);
  }
  particles = particles.filter((p) => p.life > 0);
  window.__fxCount = particles.length;
  if (particles.length) {
    raf = requestAnimationFrame(tick);
  } else {
    raf = 0;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

export function playSkillFX(skillId) {
  ensureCanvas();
  const cfg = SKILL_FX[skillId] || SKILL_FX.normal;
  const cx = window.innerWidth / 2;
  const cy = window.innerHeight / 2;
  for (let i = 0; i < cfg.n; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = cfg.speed * (0.35 + Math.random() * 0.9);
    particles.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed * cfg.spread,
      vy: Math.sin(angle) * speed * cfg.spread,
      life: 40 + Math.random() * 30,
      maxLife: 70,
      size: cfg.size * (0.6 + Math.random() * 0.9),
      color: Math.random() < 0.35 ? cfg.c2 : cfg.c,
      shape: cfg.shape,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.25,
      gravity: cfg.gravity,
    });
  }
  window.__fxCount = particles.length;
  if (!raf) raf = requestAnimationFrame(tick);
}
