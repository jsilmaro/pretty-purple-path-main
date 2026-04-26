import { useMemo } from "react";
import { LEVELS, type AdventureStore, type LevelDef, isLevelUnlocked } from "@/lib/adventureStore";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

interface Props {
  store: AdventureStore;
  onPlay: (level: LevelDef) => void;
  onOpenShop: () => void;
  onBack: () => void;
  onReplayStory?: () => void;
}

const fmtTime = (ms: number | null) => {
  if (ms == null) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
};

// Season -> background tint for each map "biome"
const seasonStyles: Record<LevelDef["season"], { node: string; ring: string; label: string }> = {
  spring: { node: "from-pink-300 to-rose-400",   ring: "ring-pink-200",   label: "bg-pink-100 text-pink-700" },
  summer: { node: "from-amber-300 to-orange-400", ring: "ring-amber-200", label: "bg-amber-100 text-amber-700" },
  autumn: { node: "from-orange-400 to-red-500",  ring: "ring-orange-200", label: "bg-orange-100 text-orange-700" },
  winter: { node: "from-sky-300 to-indigo-400",  ring: "ring-sky-200",    label: "bg-sky-100 text-sky-700" },
};

// Build a winding S-curve of node positions across a virtual canvas.
// Coordinates are in % of the map container (so they scale responsively).
const buildPath = (count: number) => {
  const nodes: { x: number; y: number }[] = [];
  // Vertical layout: walk from bottom to top with horizontal sway.
  const topPad = 6;
  const bottomPad = 6;
  const usable = 100 - topPad - bottomPad;
  for (let i = 0; i < count; i++) {
    const t = i / Math.max(1, count - 1);
    const y = 100 - bottomPad - t * usable; // bottom (start) -> top (end)
    // Sway left/right with a sine, plus a slight extra wobble
    const sway = Math.sin(t * Math.PI * 2.4) * 28; // -28..28
    const wobble = Math.sin(t * Math.PI * 5) * 6;
    const x = 50 + sway + wobble;
    nodes.push({ x: Math.max(12, Math.min(88, x)), y });
  }
  return nodes;
};

export const LevelSelect = ({ store, onPlay, onOpenShop, onBack, onReplayStory }: Props) => {
  const nodes = useMemo(() => buildPath(LEVELS.length), []);

  // Build a smooth SVG path through the nodes for the "trail"
  const pathD = useMemo(() => {
    if (nodes.length === 0) return "";
    let d = `M ${nodes[0].x} ${nodes[0].y}`;
    for (let i = 1; i < nodes.length; i++) {
      const prev = nodes[i - 1];
      const curr = nodes[i];
      const midY = (prev.y + curr.y) / 2;
      // Cubic curve with control points biased horizontally for a candy-crush feel
      d += ` C ${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`;
    }
    return d;
  }, [nodes]);

  return (
    <div className="absolute inset-0 rounded-2xl bg-gradient-magical overflow-hidden animate-fade-in">
      {/* Decorative scenery */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <div className="absolute top-6 left-8 text-4xl animate-float">☁️</div>
        <div className="absolute top-16 right-12 text-3xl animate-float" style={{ animationDelay: "0.6s" }}>☁️</div>
        <div className="absolute bottom-24 left-12 text-3xl">🌲</div>
        <div className="absolute bottom-12 right-10 text-3xl">🌲</div>
        <div className="absolute top-1/3 right-6 text-2xl">🦋</div>
        <div className="absolute bottom-1/3 left-6 text-2xl">🌼</div>
      </div>

      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 sm:p-4">
        <button
          onClick={onBack}
          className="bg-card/85 backdrop-blur-md rounded-2xl px-3 py-2 font-display font-semibold text-primary-deep shadow-card hover:scale-105 transition-transform text-sm"
        >
          ← Menu
        </button>
        <div className="text-center">
          <h2 className="font-display text-xl sm:text-2xl font-bold text-primary-foreground text-shadow-soft leading-tight">
            🗺️ Adventure Map
          </h2>
          {onReplayStory && (
            <button
              onClick={onReplayStory}
              className="text-[11px] font-display text-primary-foreground/90 underline underline-offset-2 hover:text-primary-foreground"
            >
              📖 Replay story
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-card/85 backdrop-blur-md rounded-2xl px-3 py-2 shadow-card flex items-center gap-1.5">
            <span className="text-lg">💎</span>
            <span className="font-display font-bold text-primary-deep tabular-nums text-sm">{store.gems}</span>
          </div>
          <Button
            onClick={onOpenShop}
            size="sm"
            className="bg-gradient-gold hover:opacity-90 text-gold-foreground font-display font-bold rounded-2xl shadow-card"
          >
            🛍️
          </Button>
        </div>
      </div>

      {/* Scrollable winding map */}
      <div className="absolute inset-0 pt-20 pb-4 overflow-y-auto overflow-x-hidden">
        <div className="relative mx-auto w-full max-w-2xl" style={{ height: "min(140vh, 1100px)" }}>
          {/* SVG winding trail */}
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            aria-hidden="true"
          >
            {/* Dashed shadow path */}
            <path
              d={pathD}
              fill="none"
              stroke="hsl(var(--primary-foreground) / 0.25)"
              strokeWidth="2.2"
              strokeDasharray="2 2"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {/* Bright path */}
            <path
              d={pathD}
              fill="none"
              stroke="hsl(var(--primary-foreground) / 0.85)"
              strokeWidth="1.2"
              strokeDasharray="0.6 1.6"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Level nodes */}
          {LEVELS.map((lvl, i) => {
            const pos = nodes[i];
            const unlocked = isLevelUnlocked(store, lvl.id);
            const progress = store.levels[lvl.id];
            const isCurrent = unlocked && !progress?.completed;
            const style = seasonStyles[lvl.season];

            return (
              <div
                key={lvl.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
              >
                {/* Node button */}
                <button
                  disabled={!unlocked}
                  onClick={() => unlocked && onPlay(lvl)}
                  aria-label={`Level ${lvl.id}: ${lvl.name}${unlocked ? "" : " (locked)"}`}
                  className={`relative flex items-center justify-center rounded-full ring-4 shadow-glow transition-all
                    w-16 h-16 sm:w-20 sm:h-20
                    ${unlocked
                      ? `bg-gradient-to-br ${style.node} ${style.ring} hover:scale-110 cursor-pointer`
                      : "bg-muted ring-muted-foreground/30 cursor-not-allowed grayscale opacity-80"}
                    ${isCurrent ? "animate-float" : ""}
                  `}
                >
                  <span className={`text-3xl sm:text-4xl ${unlocked ? "" : "opacity-50"}`}>
                    {unlocked ? lvl.emoji : "🔒"}
                  </span>
                  {/* Level number badge */}
                  <span className="absolute -top-2 -left-2 bg-card text-primary-deep font-display font-bold text-xs rounded-full w-7 h-7 flex items-center justify-center shadow-card border-2 border-primary-foreground/60">
                    {lvl.id}
                  </span>
                  {progress?.completed && (
                    <span className="absolute -top-2 -right-2 text-xl drop-shadow">✅</span>
                  )}
                  {isCurrent && (
                    <span className="absolute -top-9 left-1/2 -translate-x-1/2 text-2xl animate-bounce">📍</span>
                  )}
                  {!unlocked && (
                    <span className="absolute -bottom-1 -right-1 bg-card rounded-full p-1 shadow-card">
                      <Lock className="w-3 h-3 text-muted-foreground" />
                    </span>
                  )}
                </button>

                {/* Label card */}
                <div className="absolute left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap">
                  <div className={`px-2.5 py-1 rounded-full text-[11px] font-display font-bold shadow-card backdrop-blur-md
                    ${unlocked ? "bg-card/95 text-primary-deep" : "bg-card/60 text-muted-foreground"}`}
                  >
                    {lvl.name}
                  </div>
                  {progress?.completed && (
                    <div className="mt-1 text-center text-[10px] text-primary-foreground/90 font-display">
                      ⭐ {fmtTime(progress.bestTimeMs)} · 💎 {progress.gemsCollected}
                    </div>
                  )}
                  {!progress?.completed && unlocked && (
                    <div className={`mt-1 text-center text-[10px] font-display inline-block px-1.5 py-0.5 rounded-full ${style.label}`}>
                      ⏱ {lvl.timeLimitSec}s
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Castle at the top (goal) */}
          <div
            className="absolute -translate-x-1/2 -translate-y-full text-center"
            style={{ left: `${nodes[nodes.length - 1]?.x ?? 50}%`, top: `${(nodes[nodes.length - 1]?.y ?? 6) - 4}%` }}
          >
            <div className="text-5xl animate-float">🏰</div>
            <div className="text-[10px] font-display font-bold text-primary-foreground/90">Princess Petal</div>
          </div>

          {/* Start marker at the bottom */}
          <div
            className="absolute -translate-x-1/2 translate-y-2 text-center"
            style={{ left: `${nodes[0]?.x ?? 50}%`, top: `${(nodes[0]?.y ?? 94) + 4}%` }}
          >
            <div className="text-2xl">🚩</div>
            <div className="text-[10px] font-display font-bold text-primary-foreground/90">Start</div>
          </div>
        </div>
      </div>
    </div>
  );
};
