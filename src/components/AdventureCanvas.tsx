import { useEffect, useRef, useState, useCallback } from "react";
import girlSprite from "@/assets/girl-stand.png";
import bgSpring from "@/assets/bg-spring.jpg";
import bgSummer from "@/assets/bg-summer.jpg";
import bgAutumn from "@/assets/bg-autumn.jpg";
import bgWinter from "@/assets/bg-winter.jpg";
import { initSfx, playFootstep, playJump, playCollect, playStomp, playBounce, playOof, playFanfare, playZombieMoan, playSorcererCackle } from "@/lib/sfx";
import type { LevelDef, AdventureStore } from "@/lib/adventureStore";

const BG_BY_SEASON: Record<LevelDef["season"], string> = {
  spring: bgSpring, summer: bgSummer, autumn: bgAutumn, winter: bgWinter,
};

type AdvState = "ready" | "playing" | "won" | "lost";

interface Props {
  level: LevelDef;
  store: AdventureStore;
  onExit: () => void;
  onComplete: (result: { timeMs: number; gemsCollected: number; gemsAwarded: number }) => void;
}

interface Platform { x: number; y: number; w: number; h: number; }
interface Enemy {
  x: number; y: number; w: number; h: number;
  type: "snake" | "thistle" | "zombie" | "sorcerer";
  vx: number; vy?: number; alive: boolean;
  squashTimer: number;
  moanTimer?: number;
  armPhase?: number;
  hoverPhase?: number;
  cackleTimer?: number;
  baseY?: number;
}
interface Gem { x: number; y: number; r: number; collected: boolean; phase: number; }

const TILE = 48;
const GRAVITY = 2200;
const JUMP_VELOCITY = -780;
const MOVE_ACCEL = 1800;
const MAX_SPEED = 280;
const FRICTION = 1600;

const buildLevel = (def: LevelDef) => {
  const platforms: Platform[] = [];
  const enemies: Enemy[] = [];
  const gems: Gem[] = [];
  const lengthPx = def.lengthTiles * TILE;

  let x = 0;
  let seed = def.id * 9301 + 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  while (x < lengthPx) {
    const segLen = (3 + Math.floor(rand() * 5)) * TILE;
    platforms.push({ x, y: 0, w: segLen, h: TILE * 2 });
    x += segLen;
    if (x > TILE * 6 && x < lengthPx - TILE * 6 && rand() < 0.35) {
      const gap = (1 + Math.floor(rand() * 2)) * TILE;
      x += gap;
    }
  }

  for (let px = TILE * 6; px < lengthPx - TILE * 4; px += TILE * (3 + Math.floor(rand() * 4))) {
    if (rand() < 0.55) {
      const w = (2 + Math.floor(rand() * 3)) * TILE;
      const h = TILE * 0.6;
      const yOff = TILE * (2 + Math.floor(rand() * 2));
      platforms.push({ x: px, y: yOff, w, h });
      if (rand() < 0.7) {
        gems.push({ x: px + w / 2, y: yOff + h + 20, r: 10, collected: false, phase: rand() * Math.PI * 2 });
      }
    }
  }

  for (let gx = TILE * 4; gx < lengthPx - TILE * 4; gx += TILE * (2 + Math.floor(rand() * 3))) {
    if (rand() < 0.5) {
      gems.push({ x: gx, y: 26, r: 10, collected: false, phase: rand() * Math.PI * 2 });
    }
  }

  for (const p of platforms) {
    if (p.y !== 0) continue;
    if (p.w < TILE * 3) continue;
    if (p.x < TILE * 6) continue;
    const numEnemies = Math.floor(rand() * 2) + (p.w > TILE * 5 ? 1 : 0);
    for (let i = 0; i < numEnemies; i++) {
      const ex = p.x + TILE + rand() * (p.w - TILE * 2);
      const roll = rand();
      // Zombies become more common as level id increases
      const zombieChance = Math.min(0.35, 0.12 + def.id * 0.05);
      if (roll < zombieChance) {
        enemies.push({
          x: ex, y: p.h, w: 36, h: 52,
          type: "zombie",
          vx: rand() < 0.5 ? -25 : 25,
          alive: true, squashTimer: 0, moanTimer: rand() * 3, armPhase: rand() * Math.PI * 2,
        });
      } else if (roll < zombieChance + 0.45) {
        enemies.push({
          x: ex, y: p.h, w: 38, h: 22,
          type: "snake", vx: rand() < 0.5 ? -45 : 45, alive: true, squashTimer: 0,
        });
      } else {
        enemies.push({
          x: ex, y: p.h, w: 28, h: 30,
          type: "thistle", vx: 0, alive: true, squashTimer: 0,
        });
      }
    }
  }

  const goalX = lengthPx - TILE * 2;

  // Spawn the Shadow Sorcerer (core villain) — appears earlier and chases faster in higher levels.
  // Difficulty scaling: spawn earlier + faster speed as level increases.
  const sorcererSpeedByLevel = [55, 62, 70, 78, 85][Math.min(def.id - 1, 4)]; // levels 1-5
  const spawnMin = 0.70 - (def.id - 1) * 0.05; // 70% -> 50% as levels go up
  const spawnMax = spawnMin + 0.15;
  const sorcererSpawnX = lengthPx * (spawnMin + rand() * (spawnMax - spawnMin));
  enemies.push({
    x: sorcererSpawnX, y: TILE * 4.5, w: 44, h: 60,
    type: "sorcerer",
    vx: sorcererSpeedByLevel, vy: 0, alive: true, squashTimer: 0,
    hoverPhase: rand() * Math.PI * 2,
    cackleTimer: 1 + rand() * 2,
    baseY: TILE * 4.5,
  });
  // Second sorcerer for levels 3+ appears closer to the goal
  if (def.id >= 3) {
    const lateSpawnMin = 0.88 - (def.id - 3) * 0.04;
    const lateSpawnMax = lateSpawnMin + 0.08;
    enemies.push({
      x: lengthPx * (lateSpawnMin + rand() * (lateSpawnMax - lateSpawnMin)),
      y: TILE * 5, w: 44, h: 60,
      type: "sorcerer",
      vx: sorcererSpeedByLevel, vy: 0, alive: true, squashTimer: 0,
      hoverPhase: rand() * Math.PI * 2,
      cackleTimer: 0.5 + rand() * 1.5,
      baseY: TILE * 5,
    });
  }

  return { platforms, enemies, gems, lengthPx, goalX };
};

export const AdventureCanvas = ({ level, store, onExit, onComplete }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<AdvState>("ready");
  const [hudTime, setHudTime] = useState(level.timeLimitSec);
  const [hudGems, setHudGems] = useState(0);
  const stateRef = useRef<AdvState>("ready");
  const inputRef = useRef({ left: false, right: false, jump: false });
  const jumpQueuedRef = useRef(false);

  useEffect(() => { stateRef.current = state; }, [state]);

  const start = useCallback(() => {
    initSfx();
    setHudTime(level.timeLimitSec);
    setHudGems(0);
    setState("playing");
  }, [level.timeLimitSec]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { inputRef.current.left = true; e.preventDefault(); }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { inputRef.current.right = true; e.preventDefault(); }
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") {
        if (!inputRef.current.jump) jumpQueuedRef.current = true;
        inputRef.current.jump = true;
        e.preventDefault();
      }
      if (e.key === "Enter" && stateRef.current === "ready") start();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") inputRef.current.left = false;
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") inputRef.current.right = false;
      if (e.key === " " || e.key === "ArrowUp" || e.key === "w" || e.key === "W") inputRef.current.jump = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [start]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const bg = new Image();
    bg.src = BG_BY_SEASON[level.season];
    const sprite = new Image();
    sprite.src = girlSprite;

    const layout = buildLevel(level);

    const player = {
      x: TILE * 2,
      y: 200,
      w: 36, h: 60,
      vx: 0, vy: 0,
      onGround: false,
      facing: 1,
      footPhase: 0,
    };

    let cameraX = 0;
    let elapsedMs = 0;
    let gemsCollected = 0;
    let last = performance.now();
    let raf = 0;
    let footTimer = 0;
    let particles: { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }[] = [];

    const spawnPart = (x: number, y: number, color: string, count = 8) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 120;
        particles.push({
          x, y,
          vx: Math.cos(a) * s,
          vy: Math.sin(a) * s - 60,
          life: 0, max: 0.6 + Math.random() * 0.3,
          color, size: 2 + Math.random() * 3,
        });
      }
    };

    const tintForCosmetic = (id: string | null | undefined): string | null => {
      switch (id) {
        case "tint-rose": return "rgba(244, 114, 182, 0.35)";
        case "tint-mint": return "rgba(52, 211, 153, 0.35)";
        case "tint-sky":  return "rgba(96, 165, 250, 0.35)";
        default: return null;
      }
    };

    const cleanLoop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;

      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      const groundScreenY = H * 0.82;

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      if (bg.complete && bg.naturalWidth > 0) {
        const bgScale = H / bg.naturalHeight;
        const bgW = bg.naturalWidth * bgScale;
        const px = -((cameraX * 0.3) % bgW);
        ctx.drawImage(bg, px, 0, bgW, H);
        ctx.drawImage(bg, px + bgW, 0, bgW, H);
      } else {
        const grad = ctx.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "#c8a8e9");
        grad.addColorStop(1, "#f6e7c8");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
      }

      if (stateRef.current === "playing") {
        elapsedMs += dt * 1000;
        const timeLeft = Math.max(0, level.timeLimitSec - elapsedMs / 1000);
        setHudTime(timeLeft);

        const ax = (inputRef.current.right ? 1 : 0) - (inputRef.current.left ? 1 : 0);
        if (ax !== 0) {
          player.vx += ax * MOVE_ACCEL * dt;
          player.facing = ax > 0 ? 1 : -1;
        } else {
          const sign = Math.sign(player.vx);
          player.vx -= sign * Math.min(Math.abs(player.vx), FRICTION * dt);
        }
        player.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, player.vx));

        if (jumpQueuedRef.current && player.onGround) {
          player.vy = -JUMP_VELOCITY;
          player.onGround = false;
          playJump();
        }
        jumpQueuedRef.current = false;

        player.vy -= GRAVITY * dt;

        const prevX = player.x;
        player.x += player.vx * dt;
        for (const p of layout.platforms) {
          const overlapY = !(player.y + player.h <= p.y || player.y >= p.y + p.h);
          const overlapX = !(player.x + player.w <= p.x || player.x >= p.x + p.w);
          if (overlapX && overlapY) {
            if (player.vx > 0) player.x = p.x - player.w;
            else if (player.vx < 0) player.x = p.x + p.w;
            player.vx = 0;
          }
        }
        if (player.x < cameraX + 4) player.x = cameraX + 4;
        if (player.x + player.w > layout.lengthPx) player.x = layout.lengthPx - player.w;

        const prevY = player.y;
        player.y += player.vy * dt;
        player.onGround = false;
        for (const p of layout.platforms) {
          const overlapX = !(player.x + player.w <= p.x || player.x >= p.x + p.w);
          if (!overlapX) continue;
          const playerBottom = player.y;
          const playerTop = player.y + player.h;
          const platTop = p.y + p.h;
          const platBottom = p.y;
          if (player.vy <= 0 && prevY >= platTop - 1 && playerBottom <= platTop && playerBottom > platBottom) {
            player.y = platTop;
            player.vy = 0;
            player.onGround = true;
          } else if (player.vy > 0 && playerTop >= platBottom && playerTop < platTop) {
            player.y = platBottom - player.h;
            player.vy = 0;
          }
        }

        if (player.y < -200) {
          playOof();
          setState("lost");
        }

        cameraX += level.scrollSpeed * dt;
        const camMax = Math.max(0, layout.lengthPx - W + 100);
        cameraX = Math.min(cameraX, camMax);

        if (player.x + player.w < cameraX) {
          playOof();
          setState("lost");
        }

        if (player.onGround && Math.abs(player.vx) > 30) {
          footTimer -= dt;
          player.footPhase += dt * (Math.abs(player.vx) / 60);
          if (footTimer <= 0) {
            playFootstep(0.7);
            footTimer = Math.abs(player.vx) > 180 ? 0.22 : 0.32;
          }
        } else {
          footTimer = 0;
        }

        for (const e of layout.enemies) {
          if (!e.alive) {
            e.squashTimer += dt;
            continue;
          }
          if (e.type === "snake") {
            e.x += e.vx * dt;
            const ground = layout.platforms.find(p => p.y === 0 && e.x >= p.x && e.x + e.w <= p.x + p.w);
            if (!ground) { e.vx = -e.vx; e.x += e.vx * dt * 2; }
          } else if (e.type === "zombie") {
            // Chase the player slowly along the ground
            const dir = player.x + player.w / 2 < e.x + e.w / 2 ? -1 : 1;
            const speed = 55;
            e.vx = dir * speed;
            const nextX = e.x + e.vx * dt;
            const ground = layout.platforms.find(p => p.y === 0 && nextX >= p.x && nextX + e.w <= p.x + p.w);
            if (ground) e.x = nextX;
            e.armPhase = (e.armPhase ?? 0) + dt * 4;
            e.moanTimer = (e.moanTimer ?? 0) - dt;
            const distToPlayer = Math.abs((player.x + player.w / 2) - (e.x + e.w / 2));
            if ((e.moanTimer ?? 0) <= 0 && distToPlayer < 480) {
              playZombieMoan();
              e.moanTimer = 2.5 + Math.random() * 2;
            }
          } else if (e.type === "sorcerer") {
            // The Shadow Sorcerer floats and chases the princess (speed set per-level difficulty)
            const cx = player.x + player.w / 2;
            const cy = player.y + player.h / 2;
            const ex = e.x + e.w / 2;
            const ey = e.y + e.h / 2;
            const dx = cx - ex;
            const dy = cy - ey;
            const dist = Math.max(40, Math.hypot(dx, dy));
            // Use the level-scaled speed stored in vx (set at spawn), default to 70 if missing
            const speed = (e.vx && e.vx > 0) ? e.vx : 70;
            e.x += (dx / dist) * speed * dt;
            // Vertical bob plus gentle homing — but don't dive below ground
            const targetY = Math.max(TILE * 2.2, (e.baseY ?? e.y) + (dy / dist) * 30);
            e.y += ((targetY - e.y) * 1.2) * dt;
            e.hoverPhase = (e.hoverPhase ?? 0) + dt * 2.5;
            e.y += Math.sin(e.hoverPhase) * 0.6;
            e.cackleTimer = (e.cackleTimer ?? 0) - dt;
            const distToPlayerX = Math.abs(cx - ex);
            if ((e.cackleTimer ?? 0) <= 0 && distToPlayerX < 520) {
              playSorcererCackle();
              e.cackleTimer = 3 + Math.random() * 2;
            }
          }
          const overlap =
            player.x + player.w > e.x &&
            player.x < e.x + e.w &&
            player.y < e.y + e.h &&
            player.y + player.h > e.y;
          if (overlap) {
            const playerFeet = player.y;
            const isStomp = player.vy < 0 && playerFeet >= e.y + e.h - 14;
            if (e.type === "snake" && isStomp) {
              e.alive = false;
              player.vy = 480;
              gemsCollected += 2;
              setHudGems(gemsCollected);
              spawnPart(e.x + e.w / 2, e.y + e.h, "#86efac", 12);
              playStomp();
              playBounce();
            } else if (e.type === "zombie" && isStomp) {
              e.alive = false;
              player.vy = 520;
              gemsCollected += 4;
              setHudGems(gemsCollected);
              spawnPart(e.x + e.w / 2, e.y + e.h, "#65a30d", 16);
              spawnPart(e.x + e.w / 2, e.y + e.h, "#a3a3a3", 8);
              playStomp();
              playBounce();
            } else if (e.type === "sorcerer" && isStomp) {
              e.alive = false;
              player.vy = 600;
              gemsCollected += 8;
              setHudGems(gemsCollected);
              spawnPart(e.x + e.w / 2, e.y + e.h, "#7c3aed", 18);
              spawnPart(e.x + e.w / 2, e.y + e.h, "#fcd34d", 10);
              playStomp();
              playBounce();
            } else {
              playOof();
              setState("lost");
            }
          }
        }

        for (const g of layout.gems) {
          if (g.collected) continue;
          g.phase += dt * 4;
          const overlap =
            player.x + player.w > g.x - g.r &&
            player.x < g.x + g.r &&
            player.y < g.y + g.r &&
            player.y + player.h > g.y - g.r;
          if (overlap) {
            g.collected = true;
            gemsCollected += 1;
            setHudGems(gemsCollected);
            spawnPart(g.x, g.y, "#fcd34d", 10);
            playCollect("gem");
          }
        }

        if (player.x >= layout.goalX) {
          playFanfare();
          setState("won");
        }

        if (timeLeft <= 0) {
          playOof();
          setState("lost");
        }
      }

      particles = particles.filter(pt => {
        pt.life += dt;
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy -= 600 * dt;
        return pt.life < pt.max;
      });

      ctx.save();
      ctx.translate(-cameraX, 0);

      for (const p of layout.platforms) {
        const screenX = p.x;
        const topY = groundScreenY - (p.y + p.h);
        const bottomY = p.y === 0 ? H : groundScreenY - p.y;
        if (p.y === 0) {
          const grad = ctx.createLinearGradient(0, topY, 0, bottomY);
          grad.addColorStop(0, "#a87248");
          grad.addColorStop(1, "#5a3a22");
          ctx.fillStyle = grad;
          ctx.fillRect(screenX, topY, p.w, bottomY - topY);
          ctx.fillStyle = "#74c365";
          ctx.fillRect(screenX, topY, p.w, 8);
        } else {
          const h = p.h;
          ctx.fillStyle = "#d8a06a";
          roundRect(ctx, screenX, topY, p.w, h, 8);
          ctx.fill();
          ctx.fillStyle = "#7ed957";
          roundRect(ctx, screenX, topY, p.w, 6, 6);
          ctx.fill();
        }
      }

      const flagScreenY = groundScreenY - TILE * 3.2;
      ctx.fillStyle = "#7c3aed";
      ctx.fillRect(layout.goalX, flagScreenY, 4, TILE * 3.2);
      ctx.beginPath();
      ctx.moveTo(layout.goalX + 4, flagScreenY);
      ctx.lineTo(layout.goalX + 40, flagScreenY + 16);
      ctx.lineTo(layout.goalX + 4, flagScreenY + 30);
      ctx.closePath();
      ctx.fillStyle = "#a78bfa";
      ctx.fill();

      for (const g of layout.gems) {
        if (g.collected) continue;
        const sy = groundScreenY - g.y + Math.sin(g.phase) * 3;
        ctx.save();
        ctx.translate(g.x, sy);
        ctx.rotate(Math.sin(g.phase * 0.7) * 0.2);
        ctx.fillStyle = "#fcd34d";
        ctx.beginPath();
        ctx.moveTo(0, -g.r);
        ctx.lineTo(g.r, 0);
        ctx.lineTo(0, g.r);
        ctx.lineTo(-g.r, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.beginPath();
        ctx.arc(-3, -3, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      for (const e of layout.enemies) {
        const sy = groundScreenY - (e.y + e.h);
        if (e.type === "snake") {
          if (!e.alive) {
            ctx.fillStyle = "#16a34a";
            ctx.globalAlpha = Math.max(0, 1 - e.squashTimer * 2);
            ctx.fillRect(e.x, groundScreenY - 6, e.w, 6);
            ctx.globalAlpha = 1;
            continue;
          }
          ctx.fillStyle = "#22c55e";
          roundRect(ctx, e.x, sy, e.w, e.h, 10);
          ctx.fill();
          ctx.fillStyle = "#fff";
          const ex = e.vx > 0 ? e.x + e.w - 8 : e.x + 4;
          ctx.beginPath();
          ctx.arc(ex, sy + 6, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.arc(ex, sy + 6, 1.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(ex + (e.vx > 0 ? 4 : -4), sy + 10);
          ctx.lineTo(ex + (e.vx > 0 ? 10 : -10), sy + 10);
          ctx.stroke();
        } else if (e.type === "zombie") {
          if (!e.alive) {
            ctx.fillStyle = "#4d7c0f";
            ctx.globalAlpha = Math.max(0, 1 - e.squashTimer * 2);
            ctx.fillRect(e.x, groundScreenY - 8, e.w, 8);
            ctx.globalAlpha = 1;
            continue;
          }
          const facing = e.vx >= 0 ? 1 : -1;
          const armSwing = Math.sin(e.armPhase ?? 0) * 4;
          // Body
          ctx.fillStyle = "#65a30d";
          roundRect(ctx, e.x + 4, sy + 18, e.w - 8, e.h - 22, 4);
          ctx.fill();
          // Tattered shirt seam
          ctx.fillStyle = "#3f6212";
          ctx.fillRect(e.x + 4, sy + e.h - 10, e.w - 8, 2);
          // Outstretched arms (zombie reach)
          ctx.fillStyle = "#84cc16";
          ctx.fillRect(e.x - 4 + facing * 2, sy + 22 + armSwing, 8, 18);
          ctx.fillRect(e.x + e.w - 4 + facing * 2, sy + 22 - armSwing, 8, 18);
          // Head
          ctx.fillStyle = "#a3e635";
          ctx.beginPath();
          ctx.arc(e.x + e.w / 2, sy + 12, 11, 0, Math.PI * 2);
          ctx.fill();
          // Sunken eyes
          ctx.fillStyle = "#1a2e05";
          ctx.fillRect(e.x + e.w / 2 - 6, sy + 10, 3, 3);
          ctx.fillRect(e.x + e.w / 2 + 3, sy + 10, 3, 3);
          // Red eye glow
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(e.x + e.w / 2 - 5, sy + 11, 1, 1);
          ctx.fillRect(e.x + e.w / 2 + 4, sy + 11, 1, 1);
          // Drool / mouth
          ctx.strokeStyle = "#1a2e05";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(e.x + e.w / 2 - 4, sy + 17);
          ctx.lineTo(e.x + e.w / 2 + 4, sy + 17);
          ctx.stroke();
        } else if (e.type === "sorcerer") {
          if (!e.alive) {
            // Defeated puff of smoke
            ctx.fillStyle = "#4c1d95";
            ctx.globalAlpha = Math.max(0, 1 - e.squashTimer * 1.5);
            for (let i = 0; i < 5; i++) {
              ctx.beginPath();
              ctx.arc(e.x + e.w / 2 + (i - 2) * 6, sy + e.h - e.squashTimer * 30, 6 + e.squashTimer * 8, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
            continue;
          }
          const cx = e.x + e.w / 2;
          // Eerie aura
          const auraGrad = ctx.createRadialGradient(cx, sy + e.h / 2, 4, cx, sy + e.h / 2, 38);
          auraGrad.addColorStop(0, "rgba(168, 85, 247, 0.35)");
          auraGrad.addColorStop(1, "rgba(76, 29, 149, 0)");
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(cx, sy + e.h / 2, 38, 0, Math.PI * 2);
          ctx.fill();
          // Flowing cape (trapezoid)
          ctx.fillStyle = "#1e1b4b";
          ctx.beginPath();
          ctx.moveTo(cx - 22, sy + 18);
          ctx.lineTo(cx + 22, sy + 18);
          ctx.lineTo(cx + 28 + Math.sin((e.hoverPhase ?? 0) * 1.4) * 3, sy + e.h);
          ctx.lineTo(cx - 28 - Math.sin((e.hoverPhase ?? 0) * 1.4) * 3, sy + e.h);
          ctx.closePath();
          ctx.fill();
          // Inner robe
          ctx.fillStyle = "#312e81";
          ctx.fillRect(cx - 12, sy + 22, 24, e.h - 28);
          // Pointed hood
          ctx.fillStyle = "#0f0a2e";
          ctx.beginPath();
          ctx.moveTo(cx - 14, sy + 18);
          ctx.lineTo(cx + 14, sy + 18);
          ctx.lineTo(cx + 4, sy - 12);
          ctx.closePath();
          ctx.fill();
          // Shadowed face
          ctx.fillStyle = "#1a103d";
          ctx.beginPath();
          ctx.ellipse(cx, sy + 12, 9, 8, 0, 0, Math.PI * 2);
          ctx.fill();
          // Glowing eyes
          ctx.fillStyle = "#fcd34d";
          ctx.beginPath();
          ctx.arc(cx - 3, sy + 12, 1.6, 0, Math.PI * 2);
          ctx.arc(cx + 3, sy + 12, 1.6, 0, Math.PI * 2);
          ctx.fill();
          // Staff with crystal orb
          const staffSway = Math.sin((e.hoverPhase ?? 0) * 1.2) * 2;
          ctx.strokeStyle = "#3b2410";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(cx + 18, sy + e.h - 4);
          ctx.lineTo(cx + 14 + staffSway, sy - 6);
          ctx.stroke();
          ctx.fillStyle = "#a855f7";
          ctx.beginPath();
          ctx.arc(cx + 14 + staffSway, sy - 8, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.beginPath();
          ctx.arc(cx + 13 + staffSway, sy - 9, 1.2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          if (!e.alive) continue;
          ctx.fillStyle = "#7c3aed";
          ctx.beginPath();
          ctx.arc(e.x + e.w / 2, sy + e.h - 8, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#4c1d95";
          ctx.lineWidth = 2;
          for (let s = 0; s < 8; s++) {
            const a = (s / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(e.x + e.w / 2 + Math.cos(a) * 8, sy + e.h - 8 + Math.sin(a) * 8);
            ctx.lineTo(e.x + e.w / 2 + Math.cos(a) * 14, sy + e.h - 8 + Math.sin(a) * 14);
            ctx.stroke();
          }
        }
      }

      {
        const sx = player.x;
        const sy = groundScreenY - (player.y + player.h);
        if (sprite.complete && sprite.naturalWidth > 0) {
          ctx.save();
          if (player.facing < 0) {
            ctx.translate(sx + player.w, sy);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, 0, 0, player.w, player.h);
          } else {
            ctx.drawImage(sprite, sx, sy, player.w, player.h);
          }
          ctx.restore();
        } else {
          ctx.fillStyle = "#a78bfa";
          ctx.fillRect(sx, sy, player.w, player.h);
        }
        const tint = tintForCosmetic(store.equipped.tint);
        if (tint) {
          ctx.fillStyle = tint;
          ctx.globalCompositeOperation = "source-atop";
          ctx.fillRect(sx, sy, player.w, player.h);
          ctx.globalCompositeOperation = "source-over";
        }
        if (store.equipped.accessory === "acc-bow") {
          ctx.fillStyle = "#f472b6";
          ctx.beginPath();
          ctx.arc(sx + player.w / 2 - 6, sy + 4, 5, 0, Math.PI * 2);
          ctx.arc(sx + player.w / 2 + 6, sy + 4, 5, 0, Math.PI * 2);
          ctx.fill();
        } else if (store.equipped.accessory === "acc-crown") {
          ctx.fillStyle = "#fcd34d";
          ctx.beginPath();
          ctx.moveTo(sx + 6, sy + 4);
          ctx.lineTo(sx + 12, sy - 4);
          ctx.lineTo(sx + player.w / 2, sy + 2);
          ctx.lineTo(sx + player.w - 12, sy - 4);
          ctx.lineTo(sx + player.w - 6, sy + 4);
          ctx.closePath();
          ctx.fill();
        }
        if (store.equipped.trail && Math.abs(player.vx) > 50) {
          for (let i = 0; i < 3; i++) {
            const tx = sx - player.facing * (i * 6 + 4);
            const ty = sy + player.h - 8 + Math.sin(player.footPhase + i) * 3;
            if (store.equipped.trail === "trail-sparkle") {
              ctx.fillStyle = `rgba(253, 230, 138, ${0.6 - i * 0.18})`;
              ctx.beginPath();
              ctx.arc(tx, ty, 3 - i * 0.6, 0, Math.PI * 2);
              ctx.fill();
            } else {
              ctx.fillStyle = `rgba(34, 197, 94, ${0.6 - i * 0.18})`;
              ctx.beginPath();
              ctx.ellipse(tx, ty, 4, 2, 0.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      for (const pt of particles) {
        const a = 1 - pt.life / pt.max;
        ctx.globalAlpha = Math.max(0, a);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, groundScreenY - pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      if (stateRef.current === "playing") {
        const dangerDist = (player.x - cameraX) / 80;
        if (dangerDist < 1) {
          const a = (1 - Math.max(0, dangerDist)) * 0.4;
          const grad = ctx.createLinearGradient(0, 0, 80, 0);
          grad.addColorStop(0, `rgba(220, 38, 38, ${a})`);
          grad.addColorStop(1, "rgba(220, 38, 38, 0)");
          ctx.fillStyle = grad;
          ctx.fillRect(0, 0, 80, H);
        }
      }

      raf = requestAnimationFrame(cleanLoop);
    };

    last = performance.now();
    raf = requestAnimationFrame(cleanLoop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [level.id, store.equipped.tint, store.equipped.accessory, store.equipped.trail]);

  useEffect(() => {
    if (state === "won") {
      const timeMs = Math.round((level.timeLimitSec - hudTime) * 1000);
      const gemsAwarded = hudGems + 10 + Math.floor(hudTime);
      onComplete({ timeMs, gemsCollected: hudGems, gemsAwarded });
    }
  }, [state]);

  return (
    <div className="relative w-full h-full">
      <canvas ref={canvasRef} className="w-full h-full rounded-2xl shadow-card bg-secondary" />

      {state === "playing" && (
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none">
          <div className="bg-card/85 backdrop-blur-md rounded-2xl px-3 py-2 shadow-card flex items-center gap-2">
            <span className="text-xl">{level.emoji}</span>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold leading-none">Level {level.id}</div>
              <div className="font-display font-bold text-primary-deep text-sm leading-tight">{level.name}</div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className={`bg-card/85 backdrop-blur-md rounded-2xl px-3 py-2 shadow-card ${hudTime < 10 ? "ring-2 ring-destructive animate-pulse" : ""}`}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold leading-none">Time</div>
              <div className="font-display font-bold text-primary-deep tabular-nums">{hudTime.toFixed(1)}s</div>
            </div>
            <div className="bg-card/85 backdrop-blur-md rounded-2xl px-3 py-2 shadow-card flex items-center gap-1.5">
              <span className="text-base">💎</span>
              <span className="font-display font-bold text-primary-deep tabular-nums">{hudGems}</span>
            </div>
          </div>
        </div>
      )}

      {state === "playing" && (
        <div className="absolute bottom-4 left-0 right-0 flex justify-between px-4 pointer-events-none md:hidden">
          <div className="flex gap-2 pointer-events-auto">
            <button
              onTouchStart={(e) => { e.preventDefault(); inputRef.current.left = true; }}
              onTouchEnd={(e) => { e.preventDefault(); inputRef.current.left = false; }}
              onMouseDown={() => { inputRef.current.left = true; }}
              onMouseUp={() => { inputRef.current.left = false; }}
              onMouseLeave={() => { inputRef.current.left = false; }}
              className="w-16 h-16 rounded-full bg-card/85 backdrop-blur-md shadow-card text-2xl font-bold text-primary-deep active:scale-95"
              aria-label="Move left"
            >◀</button>
            <button
              onTouchStart={(e) => { e.preventDefault(); inputRef.current.right = true; }}
              onTouchEnd={(e) => { e.preventDefault(); inputRef.current.right = false; }}
              onMouseDown={() => { inputRef.current.right = true; }}
              onMouseUp={() => { inputRef.current.right = false; }}
              onMouseLeave={() => { inputRef.current.right = false; }}
              className="w-16 h-16 rounded-full bg-card/85 backdrop-blur-md shadow-card text-2xl font-bold text-primary-deep active:scale-95"
              aria-label="Move right"
            >▶</button>
          </div>
          <button
            onTouchStart={(e) => { e.preventDefault(); jumpQueuedRef.current = true; inputRef.current.jump = true; }}
            onTouchEnd={(e) => { e.preventDefault(); inputRef.current.jump = false; }}
            onMouseDown={() => { jumpQueuedRef.current = true; inputRef.current.jump = true; }}
            onMouseUp={() => { inputRef.current.jump = false; }}
            className="w-20 h-20 rounded-full bg-gradient-magical shadow-glow text-3xl font-bold text-primary-foreground active:scale-95 pointer-events-auto"
            aria-label="Jump"
          >⤴</button>
        </div>
      )}

      {state === "ready" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-primary-deep/40 backdrop-blur-sm animate-fade-in">
          <div className="bg-card/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 max-w-sm mx-4 text-center shadow-glow animate-scale-in">
            <div className="text-5xl mb-2">{level.emoji}</div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Level {level.id}</div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-primary-deep mb-2">{level.name}</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Reach the flag before time runs out. Stomp 🐍 snakes, 🧟 zombies & even Morvain the 🧙‍♂️ Sorcerer himself, avoid 🟣 thistles, collect 💎 gems!
            </p>
            <div className="grid grid-cols-2 gap-2 mb-5 text-xs">
              <div className="bg-accent-soft rounded-xl p-2">
                <div className="font-semibold text-accent">⬅ ➡ / A D</div>
                <div className="text-muted-foreground">Walk</div>
              </div>
              <div className="bg-secondary rounded-xl p-2">
                <div className="font-semibold text-soil">⬆ / Space</div>
                <div className="text-muted-foreground">Jump</div>
              </div>
            </div>
            <div className="flex gap-2 justify-center text-xs text-muted-foreground mb-4">
              <span>⏱ {level.timeLimitSec}s</span>
              <span>•</span>
              <span>📜 Auto-scroll</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={onExit}
                className="flex-1 py-3 px-4 rounded-2xl font-display font-semibold bg-muted text-muted-foreground hover:bg-secondary transition-colors"
              >Back</button>
              <button
                onClick={start}
                className="flex-[2] py-3 px-4 rounded-2xl font-display font-bold bg-gradient-magical text-primary-foreground shadow-soft hover:scale-[1.02] transition-transform"
              >Start ✨</button>
            </div>
          </div>
        </div>
      )}

      {state === "lost" && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-destructive/30 backdrop-blur-sm animate-fade-in">
          <div className="bg-card/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 max-w-sm mx-4 text-center shadow-glow animate-scale-in">
            <div className="text-5xl mb-2">🌷</div>
            <h2 className="font-display text-2xl font-bold text-primary-deep mb-1">Almost!</h2>
            <p className="text-muted-foreground text-sm mb-5">Try this level again?</p>
            <div className="flex gap-2">
              <button
                onClick={onExit}
                className="flex-1 py-3 px-4 rounded-2xl font-display font-semibold bg-muted text-muted-foreground hover:bg-secondary transition-colors"
              >Levels</button>
              <button
                onClick={() => { setHudTime(level.timeLimitSec); setHudGems(0); setState("ready"); }}
                className="flex-[2] py-3 px-4 rounded-2xl font-display font-bold bg-gradient-magical text-primary-foreground shadow-soft hover:scale-[1.02] transition-transform"
              >Retry</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

function rectVsRect(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
