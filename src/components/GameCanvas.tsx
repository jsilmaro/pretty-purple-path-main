import { useEffect, useRef, useState, useCallback } from "react";
import girlSprite from "@/assets/girl-stand.png";
import { initSfx, playFootstep, playJump, playCollect } from "@/lib/sfx";
import bgSpring from "@/assets/bg-spring.jpg";
import bgSummer from "@/assets/bg-summer.jpg";
import bgAutumn from "@/assets/bg-autumn.jpg";
import bgWinter from "@/assets/bg-winter.jpg";

export type MoveMode = "walk" | "run";

type Season = { name: string; emoji: string; src: string; ground: string; tint: string };

const SEASONS: Season[] = [
  { name: "Spring",  emoji: "🌸", src: bgSpring,  ground: "#9d6b3f", tint: "rgba(255,220,240,0.0)" },
  { name: "Summer",  emoji: "☀️", src: bgSummer,  ground: "#b07a3a", tint: "rgba(255,200,120,0.05)" },
  { name: "Autumn",  emoji: "🍂", src: bgAutumn,  ground: "#7a4a28", tint: "rgba(255,150,80,0.08)" },
  { name: "Winter",  emoji: "❄️", src: bgWinter,  ground: "#dfe6f0", tint: "rgba(220,230,255,0.15)" },
];

type GameState = "menu" | "playing" | "over";

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  type: "ground" | "low";
}
interface Collectible {
  x: number;
  y: number;
  r: number;
  kind: "flower" | "gem" | "leaf";
  collected: boolean;
}
interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number;
}

const GROUND_RATIO = 0.82;
const GRAVITY = 2200;
const JUMP_VELOCITY = -880;
const SLIDE_DURATION = 0.55;

interface Props {
  onGameOver: (score: number) => void;
  onReady: () => void;
  state: GameState;
  startSignal: number;
  mode: MoveMode;
  onToggleMode: () => void;
}

export const GameCanvas = ({ onGameOver, onReady, state, startSignal, mode, onToggleMode }: Props) => {
  const modeRef = useRef<MoveMode>(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [score, setScore] = useState(0);
  const [seasonIdx, setSeasonIdx] = useState(0);

  // Mutable game refs (avoid re-renders inside loop)
  const stateRef = useRef<GameState>(state);
  const scoreRef = useRef(0);
  const distRef = useRef(0);
  const speedRef = useRef(420);
  const seasonIdxRef = useRef(0);
  const seasonProgressRef = useRef(0);
  const playerRef = useRef({
    x: 140, y: 0, vy: 0, w: 90, h: 120,
    onGround: true, sliding: false, slideTime: 0,
  });
  const obstaclesRef = useRef<Obstacle[]>([]);
  const collectsRef = useRef<Collectible[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const spawnTimerRef = useRef(1.2);
  const collectTimerRef = useRef(0.8);
  const bgScrollRef = useRef(0);
  const bgScroll2Ref = useRef(0);
  const seasonFadeRef = useRef(0); // 0..1 for transitioning into next
  const sizeRef = useRef({ w: 800, h: 450 });

  // Image cache
  const imgsRef = useRef<{ girl: HTMLImageElement | null; bgs: HTMLImageElement[] }>({ girl: null, bgs: [] });

  useEffect(() => { stateRef.current = state; }, [state]);

  // Load images
  useEffect(() => {
    const girl = new Image();
    girl.src = girlSprite;
    imgsRef.current.girl = girl;
    let loaded = 0;
    const total = SEASONS.length + 1;
    const check = () => { loaded++; if (loaded >= total) onReady(); };
    girl.onload = check;
    girl.onerror = check;
    imgsRef.current.bgs = SEASONS.map(s => {
      const img = new Image();
      img.src = s.src;
      img.onload = check;
      img.onerror = check;
      return img;
    });
  }, [onReady]);

  // Resize handling
  useEffect(() => {
    const handle = () => {
      const c = canvasRef.current;
      const wrap = containerRef.current;
      if (!c || !wrap) return;
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      sizeRef.current = { w: rect.width, h: rect.height };
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      c.style.width = rect.width + "px";
      c.style.height = rect.height + "px";
      const ctx = c.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const groundY = rect.height * GROUND_RATIO;
      playerRef.current.y = groundY - playerRef.current.h;
    };
    handle();
    window.addEventListener("resize", handle);
    return () => window.removeEventListener("resize", handle);
  }, []);

  // Reset on start
  useEffect(() => {
    if (startSignal === 0) return;
    const { h } = sizeRef.current;
    const groundY = h * GROUND_RATIO;
    scoreRef.current = 0;
    distRef.current = 0;
    speedRef.current = 420;
    seasonIdxRef.current = 0;
    seasonProgressRef.current = 0;
    seasonFadeRef.current = 0;
    setSeasonIdx(0);
    setScore(0);
    obstaclesRef.current = [];
    collectsRef.current = [];
    particlesRef.current = [];
    spawnTimerRef.current = 1.2;
    collectTimerRef.current = 0.8;
    playerRef.current = {
      x: 140, y: groundY - 120, vy: 0, w: 90, h: 120,
      onGround: true, sliding: false, slideTime: 0,
    };
  }, [startSignal]);

  const jump = useCallback(() => {
    const p = playerRef.current;
    if (stateRef.current !== "playing") return;
    if (p.onGround && !p.sliding) {
      p.vy = JUMP_VELOCITY;
      p.onGround = false;
      playJump();
      // sparkle burst
      for (let i = 0; i < 8; i++) {
        particlesRef.current.push({
          x: p.x + p.w / 2, y: p.y + p.h,
          vx: (Math.random() - 0.5) * 200,
          vy: -Math.random() * 150,
          life: 0.6, maxLife: 0.6,
          color: `hsl(${280 + Math.random() * 30}, 80%, 75%)`,
          size: 3 + Math.random() * 3,
        });
      }
    }
  }, []);

  const slide = useCallback(() => {
    const p = playerRef.current;
    if (stateRef.current !== "playing") return;
    if (p.onGround && !p.sliding) {
      p.sliding = true;
      p.slideTime = SLIDE_DURATION;
      p.h = 70;
      const groundY = sizeRef.current.h * GROUND_RATIO;
      p.y = groundY - p.h;
    }
  }, []);

  // Input
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        jump();
      } else if (e.code === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        slide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, slide]);

  // Touch / mouse: tap top half = jump, bottom half = slide
  const handlePointer = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    if (y < rect.height * 0.6) jump(); else slide();
  };

  // Main loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(loop);
    };

    const spawnObstacle = () => {
      const { w, h } = sizeRef.current;
      const groundY = h * GROUND_RATIO;
      const isLow = Math.random() < 0.3;
      if (isLow) {
        obstaclesRef.current.push({
          x: w + 40, y: groundY - 130, w: 70, h: 50, type: "low",
        });
      } else {
        const oh = 40 + Math.random() * 50;
        const ow = 40 + Math.random() * 40;
        obstaclesRef.current.push({
          x: w + 40, y: groundY - oh, w: ow, h: oh, type: "ground",
        });
      }
    };

    const spawnCollect = () => {
      const { w, h } = sizeRef.current;
      const groundY = h * GROUND_RATIO;
      const kindRoll = Math.random();
      const kind: Collectible["kind"] = kindRoll < 0.5 ? "flower" : kindRoll < 0.85 ? "leaf" : "gem";
      const high = Math.random() < 0.5;
      const y = high ? groundY - 180 - Math.random() * 60 : groundY - 60;
      collectsRef.current.push({ x: w + 30, y, r: 16, kind, collected: false });
    };

    const update = (dt: number) => {
      if (stateRef.current !== "playing") return;
      const { w, h } = sizeRef.current;
      const groundY = h * GROUND_RATIO;
      const p = playerRef.current;

      // Speed up over time (run mode is faster than walk)
      const cap = modeRef.current === "walk" ? 380 : 900;
      const accel = modeRef.current === "walk" ? 4 : 8;
      speedRef.current = Math.min(cap, speedRef.current + dt * accel);
      distRef.current += speedRef.current * dt;

      // Background scroll
      bgScrollRef.current = (bgScrollRef.current + speedRef.current * 0.2 * dt) % w;
      bgScroll2Ref.current = (bgScroll2Ref.current + speedRef.current * dt) % 80;

      // Season progress: change every ~1500 distance
      seasonProgressRef.current += speedRef.current * dt;
      if (seasonProgressRef.current > 1800) {
        seasonProgressRef.current = 0;
        seasonFadeRef.current = 0.001;
      }
      if (seasonFadeRef.current > 0) {
        seasonFadeRef.current += dt * 0.6;
        if (seasonFadeRef.current >= 1) {
          seasonFadeRef.current = 0;
          seasonIdxRef.current = (seasonIdxRef.current + 1) % SEASONS.length;
          setSeasonIdx(seasonIdxRef.current);
        }
      }

      // Player physics
      p.vy += GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y + p.h >= groundY) {
        p.y = groundY - p.h;
        p.vy = 0;
        p.onGround = true;
      }
      if (p.sliding) {
        p.slideTime -= dt;
        if (p.slideTime <= 0) {
          p.sliding = false;
          p.h = 120;
          p.y = groundY - p.h;
        }
      }

      // Spawn obstacles
      spawnTimerRef.current -= dt;
      if (spawnTimerRef.current <= 0) {
        spawnObstacle();
        const minGap = Math.max(0.65, 1.4 - speedRef.current / 1200);
        spawnTimerRef.current = minGap + Math.random() * 0.7;
      }

      // Spawn collectibles
      collectTimerRef.current -= dt;
      if (collectTimerRef.current <= 0) {
        spawnCollect();
        collectTimerRef.current = 0.6 + Math.random() * 0.9;
      }

      // Move obstacles
      for (const o of obstaclesRef.current) o.x -= speedRef.current * dt;
      obstaclesRef.current = obstaclesRef.current.filter(o => o.x + o.w > -50);

      // Move collectibles
      for (const c of collectsRef.current) c.x -= speedRef.current * dt;
      collectsRef.current = collectsRef.current.filter(c => c.x + c.r > -50 && !c.collected);

      // Particles
      for (const part of particlesRef.current) {
        part.x += part.vx * dt;
        part.y += part.vy * dt;
        part.vy += 400 * dt;
        part.life -= dt;
      }
      particlesRef.current = particlesRef.current.filter(p => p.life > 0);

      // Collisions
      const px = p.x + 15, py = p.y + 10, pw = p.w - 30, ph = p.h - 15;
      for (const o of obstaclesRef.current) {
        if (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph > o.y) {
          // Game over
          stateRef.current = "over";
          // death sparkles
          for (let i = 0; i < 30; i++) {
            particlesRef.current.push({
              x: p.x + p.w / 2, y: p.y + p.h / 2,
              vx: (Math.random() - 0.5) * 500,
              vy: (Math.random() - 0.7) * 400,
              life: 1.2, maxLife: 1.2,
              color: `hsl(${Math.random() * 360}, 80%, 70%)`,
              size: 4 + Math.random() * 4,
            });
          }
          onGameOver(scoreRef.current);
          return;
        }
      }
      // Collectible pickup
      for (const c of collectsRef.current) {
        const dx = (p.x + p.w / 2) - c.x;
        const dy = (p.y + p.h / 2) - c.y;
        if (dx * dx + dy * dy < (c.r + 40) * (c.r + 40)) {
          c.collected = true;
          const pts = c.kind === "gem" ? 50 : c.kind === "flower" ? 15 : 10;
          scoreRef.current += pts;
          playCollect(c.kind);
          for (let i = 0; i < 12; i++) {
            particlesRef.current.push({
              x: c.x, y: c.y,
              vx: (Math.random() - 0.5) * 300,
              vy: (Math.random() - 0.7) * 250,
              life: 0.7, maxLife: 0.7,
              color: c.kind === "gem" ? "hsl(280, 90%, 75%)" : c.kind === "flower" ? "hsl(320, 80%, 75%)" : "hsl(130, 70%, 60%)",
              size: 3 + Math.random() * 3,
            });
          }
        }
      }

      // Distance score
      scoreRef.current += dt * 10;
      setScore(Math.floor(scoreRef.current));
    };

    const drawBg = (ctx: CanvasRenderingContext2D, idx: number, alpha: number) => {
      const { w, h } = sizeRef.current;
      const img = imgsRef.current.bgs[idx];
      if (!img || !img.complete) return;
      ctx.globalAlpha = alpha;
      // Cover-fit
      const ratio = img.width / img.height;
      const targetH = h;
      const targetW = targetH * ratio;
      const offset = bgScrollRef.current % targetW;
      // Draw two copies for seamless scroll
      for (let x = -offset; x < w + targetW; x += targetW) {
        ctx.drawImage(img, x, 0, targetW, targetH);
      }
      ctx.globalAlpha = 1;
    };

    const drawGround = (ctx: CanvasRenderingContext2D) => {
      const { w, h } = sizeRef.current;
      const groundY = h * GROUND_RATIO;
      const idx = seasonIdxRef.current;
      const nextIdx = (idx + 1) % SEASONS.length;
      const fade = seasonFadeRef.current;
      const lerp = (a: string, b: string, t: number) => fade > 0 ? b : a;
      const color = lerp(SEASONS[idx].ground, SEASONS[nextIdx].ground, fade);
      // soil/snow band
      const grad = ctx.createLinearGradient(0, groundY, 0, h);
      grad.addColorStop(0, color);
      grad.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, groundY, w, h - groundY);
      // dashed path lines
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 3;
      ctx.setLineDash([20, 20]);
      ctx.lineDashOffset = -bgScroll2Ref.current;
      ctx.beginPath();
      ctx.moveTo(0, groundY + 18);
      ctx.lineTo(w, groundY + 18);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    const drawPlayer = (ctx: CanvasRenderingContext2D) => {
      const p = playerRef.current;
      const img = imgsRef.current.girl;
      const groundY = sizeRef.current.h * GROUND_RATIO;
      const heightAbove = groundY - (p.y + p.h);
      const shadowScale = Math.max(0.4, 1 - heightAbove / 300);

      // Shadow
      ctx.fillStyle = `rgba(60, 30, 80, ${0.35 * shadowScale})`;
      ctx.beginPath();
      ctx.ellipse(p.x + p.w / 2, groundY + 6, (p.w / 2) * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();

      // Animation timing — cycle speed scales with movement speed
      const cycleSpeed = modeRef.current === "walk" ? 6 : 11;
      const phase = (distRef.current / (modeRef.current === "walk" ? 60 : 50)) * Math.PI;
      const left = Math.sin(phase);
      const right = Math.sin(phase + Math.PI);
      const bobAmp = modeRef.current === "walk" ? 2 : 4;
      const bob = p.onGround && !p.sliding ? Math.abs(Math.sin(phase)) * bobAmp - bobAmp / 2 : 0;
      const tilt = p.onGround && !p.sliding ? Math.sin(phase) * (modeRef.current === "walk" ? 0.02 : 0.05) : 0;

      // Footfalls: detect heel strikes for SFX (walk + run) and dust (run only)
      if (p.onGround && !p.sliding && stateRef.current === "playing") {
        const phaseFrac = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const lastPhase = (p as any)._lastPhase ?? phaseFrac;
        // Two strikes per cycle: crossing PI and crossing 2PI/0
        const crossedHalf = lastPhase < Math.PI && phaseFrac >= Math.PI;
        const crossedFull = phaseFrac < lastPhase; // wrapped around
        if (crossedHalf || crossedFull) {
          const isRun = modeRef.current === "run";
          playFootstep(isRun ? 1 : 0.65);
          if (isRun) {
            for (let i = 0; i < 3; i++) {
              particlesRef.current.push({
                x: p.x + p.w / 2 + (Math.random() - 0.5) * 20,
                y: groundY,
                vx: -50 - Math.random() * 80,
                vy: -20 - Math.random() * 40,
                life: 0.4, maxLife: 0.4,
                color: "rgba(180, 150, 110, 0.55)",
                size: 3 + Math.random() * 2,
              });
            }
          }
        }
        (p as any)._lastPhase = phaseFrac;
      }

      ctx.save();

      if (p.sliding) {
        // Sliding pose: tilt forward, legs extended
        const cx = p.x + p.w / 2;
        const cy = p.y + p.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 2.4);
        if (img && img.complete) {
          ctx.drawImage(img, -p.w / 2, -p.h * 0.9, p.w, p.h * 1.6);
        }
        ctx.restore();
        return;
      }

      // --- Animated legs (drawn behind body) ---
      const bodyX = p.x;
      const bodyY = p.y + bob;
      const bodyW = p.w;
      const bodyH = p.h;
      const hipY = bodyY + bodyH * 0.78;
      const hipCx = bodyX + bodyW * 0.5;

      const inAir = !p.onGround;
      // Leg swing amounts
      const swingFront = inAir ? -0.6 : left * 0.7;   // negative = up/forward
      const swingBack  = inAir ? -0.3 : right * 0.7;
      const legLen = bodyH * 0.18;

      const drawLeg = (swing: number, side: number) => {
        // swing: -1 forward (up), 1 back (down). side: -1 left, 1 right
        const hipX = hipCx + side * 6;
        const lift = swing < 0 ? -swing * 8 : 0; // foot lifts when forward
        const footX = hipX + Math.sin(swing) * legLen * 0.8;
        const footY = hipY + Math.cos(swing) * legLen - lift;
        // leg (purple stocking-ish hidden by dress, just draw boot stem)
        ctx.strokeStyle = "hsl(280, 25%, 90%)";
        ctx.lineWidth = 7;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(hipX, hipY);
        ctx.lineTo(footX, footY);
        ctx.stroke();
        // boot
        ctx.fillStyle = "hsl(28, 50%, 32%)";
        ctx.beginPath();
        ctx.ellipse(footX, footY + 2, 9, 7, Math.sin(swing) * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "hsl(28, 55%, 22%)";
        ctx.fillRect(footX - 9, footY + 6, 18, 3);
      };

      // Back leg first (so front overlaps)
      drawLeg(swingBack, -1);

      // --- Body sprite ---
      if (img && img.complete) {
        ctx.save();
        ctx.translate(bodyX + bodyW / 2, bodyY + bodyH / 2);
        ctx.rotate(tilt);
        // Crop the sprite so we don't draw its static feet (legs handle that)
        const cropBottom = 0.18; // skip bottom 18% (boots from sprite)
        const sw = img.width;
        const sh = img.height * (1 - cropBottom);
        ctx.drawImage(
          img,
          0, 0, sw, sh,
          -bodyW / 2, -bodyH / 2, bodyW, bodyH * (1 - cropBottom)
        );
        ctx.restore();
      } else {
        ctx.fillStyle = "hsl(268, 65%, 62%)";
        ctx.fillRect(bodyX, bodyY, bodyW, bodyH * 0.82);
      }

      // Front leg (over body)
      drawLeg(swingFront, 1);

      // Subtle arm swing — small swinging accent over body
      if (!inAir) {
        const armSwing = Math.sin(phase + Math.PI) * 8;
        ctx.strokeStyle = "hsla(280, 30%, 95%, 0.0)"; // invisible placeholder; arm comes from sprite
        // small motion lines behind for run mode
        if (modeRef.current === "run") {
          ctx.strokeStyle = "rgba(255,255,255,0.35)";
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(bodyX - 8 - i * 6, bodyY + bodyH * 0.4 + i * 8 + armSwing * 0.2);
            ctx.lineTo(bodyX - 22 - i * 6, bodyY + bodyH * 0.4 + i * 8 + armSwing * 0.2);
            ctx.stroke();
          }
        }
      }

      ctx.restore();
      void cycleSpeed;
    };

    const drawObstacles = (ctx: CanvasRenderingContext2D) => {
      const idx = seasonIdxRef.current;
      for (const o of obstaclesRef.current) {
        if (o.type === "ground") {
          // rock / log shaped
          const grad = ctx.createLinearGradient(o.x, o.y, o.x, o.y + o.h);
          if (idx === 3) {
            grad.addColorStop(0, "#e8edf5");
            grad.addColorStop(1, "#a8b3c4");
          } else if (idx === 2) {
            grad.addColorStop(0, "#7a4a28");
            grad.addColorStop(1, "#3d2515");
          } else {
            grad.addColorStop(0, "#8a6a4a");
            grad.addColorStop(1, "#4a3520");
          }
          ctx.fillStyle = grad;
          ctx.beginPath();
          const r = 10;
          ctx.moveTo(o.x + r, o.y);
          ctx.lineTo(o.x + o.w - r, o.y);
          ctx.quadraticCurveTo(o.x + o.w, o.y, o.x + o.w, o.y + r);
          ctx.lineTo(o.x + o.w, o.y + o.h);
          ctx.lineTo(o.x, o.y + o.h);
          ctx.lineTo(o.x, o.y + r);
          ctx.quadraticCurveTo(o.x, o.y, o.x + r, o.y);
          ctx.fill();
          // moss/snow top
          ctx.fillStyle = idx === 3 ? "rgba(255,255,255,0.9)" : "hsl(130, 50%, 45%)";
          ctx.fillRect(o.x + 4, o.y - 2, o.w - 8, 6);
        } else {
          // floating low (bird/branch) - draw as branch with leaves
          ctx.fillStyle = "hsl(28, 45%, 30%)";
          ctx.fillRect(o.x, o.y + o.h / 2 - 4, o.w, 8);
          ctx.fillStyle = "hsl(130, 55%, 50%)";
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.ellipse(o.x + 15 + i * 20, o.y + o.h / 2 - 8, 12, 8, -0.3, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "hsl(268, 65%, 70%)";
          ctx.beginPath();
          ctx.arc(o.x + o.w / 2, o.y + o.h / 2 - 14, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    const drawCollects = (ctx: CanvasRenderingContext2D) => {
      const t = performance.now() / 300;
      for (const c of collectsRef.current) {
        const bob = Math.sin(t + c.x * 0.01) * 4;
        ctx.save();
        ctx.translate(c.x, c.y + bob);
        // glow
        const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 24);
        const glowColor = c.kind === "gem" ? "hsla(280, 90%, 75%, 0.6)" : c.kind === "flower" ? "hsla(320, 80%, 75%, 0.5)" : "hsla(130, 70%, 60%, 0.5)";
        glow.addColorStop(0, glowColor);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.fillRect(-24, -24, 48, 48);

        if (c.kind === "gem") {
          ctx.fillStyle = "hsl(280, 85%, 65%)";
          ctx.beginPath();
          ctx.moveTo(0, -14);
          ctx.lineTo(12, 0);
          ctx.lineTo(0, 14);
          ctx.lineTo(-12, 0);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.beginPath();
          ctx.moveTo(-4, -6);
          ctx.lineTo(2, -10);
          ctx.lineTo(4, -2);
          ctx.closePath();
          ctx.fill();
        } else if (c.kind === "flower") {
          // 5 petals
          ctx.fillStyle = "hsl(320, 80%, 75%)";
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * Math.PI * 2;
            ctx.beginPath();
            ctx.ellipse(Math.cos(a) * 7, Math.sin(a) * 7, 6, 9, a, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "hsl(45, 90%, 60%)";
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // leaf
          ctx.fillStyle = "hsl(130, 55%, 50%)";
          ctx.beginPath();
          ctx.ellipse(0, 0, 8, 14, Math.PI / 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "hsl(130, 55%, 30%)";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(-5, 5);
          ctx.lineTo(5, -5);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    const drawParticles = (ctx: CanvasRenderingContext2D) => {
      for (const p of particlesRef.current) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawSeasonOverlay = (ctx: CanvasRenderingContext2D) => {
      const idx = seasonIdxRef.current;
      const { w, h } = sizeRef.current;
      // Falling leaves / snow / petals
      const t = performance.now() / 1000;
      ctx.save();
      if (idx === 2) {
        // autumn leaves
        for (let i = 0; i < 12; i++) {
          const x = ((i * 137 + t * 60) % (w + 40)) - 20;
          const y = ((i * 89 + t * 80) % h);
          ctx.fillStyle = i % 2 ? "hsla(28, 70%, 50%, 0.7)" : "hsla(280, 60%, 60%, 0.7)";
          ctx.beginPath();
          ctx.ellipse(x, y, 6, 4, t + i, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (idx === 3) {
        // snow
        for (let i = 0; i < 30; i++) {
          const x = ((i * 53 + t * 30) % (w + 20)) - 10;
          const y = ((i * 71 + t * 60) % h);
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.beginPath();
          ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (idx === 0) {
        // petals
        for (let i = 0; i < 10; i++) {
          const x = ((i * 113 + t * 50) % (w + 30)) - 15;
          const y = ((i * 67 + t * 70) % h);
          ctx.fillStyle = "hsla(320, 80%, 80%, 0.7)";
          ctx.beginPath();
          ctx.ellipse(x, y, 5, 3, t * 2 + i, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    };

    const draw = () => {
      const c = canvasRef.current;
      if (!c) return;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const { w, h } = sizeRef.current;
      ctx.clearRect(0, 0, w, h);

      const idx = seasonIdxRef.current;
      const nextIdx = (idx + 1) % SEASONS.length;
      const fade = seasonFadeRef.current;

      drawBg(ctx, idx, 1);
      if (fade > 0) drawBg(ctx, nextIdx, fade);

      drawSeasonOverlay(ctx);
      drawGround(ctx);
      drawCollects(ctx);
      drawObstacles(ctx);
      drawPlayer(ctx);
      drawParticles(ctx);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onGameOver]);

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden rounded-2xl shadow-soft">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointer}
        className="w-full h-full block touch-none cursor-pointer"
      />
      {/* HUD */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-4 flex items-start justify-between gap-2">
        <div className="bg-card/85 backdrop-blur-md rounded-2xl px-5 py-2.5 shadow-card">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Score</div>
          <div className="text-3xl font-display font-bold text-primary-deep tabular-nums leading-none">{score}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleMode(); }}
            onPointerDown={(e) => e.stopPropagation()}
            className="pointer-events-auto bg-card/85 backdrop-blur-md rounded-2xl px-4 py-2.5 shadow-card hover:scale-105 transition-transform flex items-center gap-2"
            aria-label={`Switch to ${mode === "walk" ? "run" : "walk"} mode`}
          >
            <span className="text-2xl">{mode === "walk" ? "🚶‍♀️" : "🏃‍♀️"}</span>
            <div className="text-left">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Pace</div>
              <div className="text-sm font-display font-semibold text-primary-deep leading-none capitalize">{mode}</div>
            </div>
          </button>

          <div className="bg-card/85 backdrop-blur-md rounded-2xl px-5 py-2.5 shadow-card flex items-center gap-2">
            <span className="text-2xl">{SEASONS[seasonIdx].emoji}</span>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Season</div>
              <div className="text-lg font-display font-semibold text-primary-deep leading-none">{SEASONS[seasonIdx].name}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
