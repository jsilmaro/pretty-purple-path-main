import { useEffect, useState } from "react";
import { GameCanvas, type MoveMode } from "@/components/GameCanvas";
import { AdventureCanvas } from "@/components/AdventureCanvas";
import { LevelSelect } from "@/components/LevelSelect";
import { AdventureShop } from "@/components/AdventureShop";
import { StoryIntro } from "@/components/StoryIntro";
import { Button } from "@/components/ui/button";
import { initSfx, setSfxMuted, playFanfare } from "@/lib/sfx";
import { Volume2, VolumeX } from "lucide-react";
import {
  loadStore, addGems, recordLevelResult, markIntroSeen,
  type AdventureStore, type LevelDef,
} from "@/lib/adventureStore";

type EndlessState = "menu" | "playing" | "over";
type AppMode = "home" | "endless" | "adventure-intro" | "adventure-select" | "adventure-play" | "adventure-result";

const HIGH_SCORE_KEY = "lila-adventure-high-score";

const Index = () => {
  const [appMode, setAppMode] = useState<AppMode>("home");
  const [endlessState, setEndlessState] = useState<EndlessState>("menu");
  const [lastScore, setLastScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [ready, setReady] = useState(false);
  const [startSignal, setStartSignal] = useState(0);
  const [mode, setMode] = useState<MoveMode>("walk");
  const [muted, setMuted] = useState(false);
  const [store, setStore] = useState<AdventureStore>(() => loadStore());
  const [shopOpen, setShopOpen] = useState(false);
  const [activeLevel, setActiveLevel] = useState<LevelDef | null>(null);
  const [lastResult, setLastResult] = useState<{ timeMs: number; gemsCollected: number; gemsAwarded: number; level: LevelDef } | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(HIGH_SCORE_KEY);
    if (stored) setHighScore(parseInt(stored, 10) || 0);
  }, []);

  const handleEndlessStart = () => {
    initSfx();
    setStartSignal((s) => s + 1);
    setEndlessState("playing");
    setAppMode("endless");
  };

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      setSfxMuted(next);
      return next;
    });
  };

  const handleEndlessGameOver = (score: number) => {
    setLastScore(score);
    if (score > highScore) {
      setHighScore(score);
      localStorage.setItem(HIGH_SCORE_KEY, String(score));
    }
    setEndlessState("over");
  };

  const handlePlayLevel = (level: LevelDef) => {
    initSfx();
    setActiveLevel(level);
    setAppMode("adventure-play");
  };

  const handleLevelComplete = (result: { timeMs: number; gemsCollected: number; gemsAwarded: number }) => {
    if (!activeLevel) return;
    let next = recordLevelResult(store, activeLevel.id, result.timeMs, result.gemsCollected);
    next = addGems(next, result.gemsAwarded);
    setStore(next);
    setLastResult({ ...result, level: activeLevel });
    setAppMode("adventure-result");
    playFanfare();
  };

  return (
    <main className="min-h-screen w-full bg-gradient-magical flex items-center justify-center p-3 sm:p-6">
      <div className="w-full max-w-6xl aspect-[16/9] relative">
        <h1 className="sr-only">Lila's Adventure — Magical Platformer & Endless Runner</h1>

        {/* Endless mode canvas (always mounted to keep state) */}
        {(appMode === "home" || appMode === "endless") && (
          <GameCanvas
            state={appMode === "endless" ? endlessState : "menu"}
            startSignal={startSignal}
            mode={mode}
            onToggleMode={() => setMode((m) => (m === "walk" ? "run" : "walk"))}
            onReady={() => setReady(true)}
            onGameOver={handleEndlessGameOver}
          />
        )}

        {/* Adventure canvas */}
        {appMode === "adventure-play" && activeLevel && (
          <AdventureCanvas
            level={activeLevel}
            store={store}
            onExit={() => setAppMode("adventure-select")}
            onComplete={handleLevelComplete}
          />
        )}

        {/* Adventure level select */}
        {appMode === "adventure-select" && (
          <LevelSelect
            store={store}
            onPlay={handlePlayLevel}
            onOpenShop={() => setShopOpen(true)}
            onBack={() => setAppMode("home")}
            onReplayStory={() => setAppMode("adventure-intro")}
          />
        )}

        {/* Adventure story intro */}
        {appMode === "adventure-intro" && (
          <StoryIntro
            onFinish={() => {
              setStore((s) => markIntroSeen(s));
              setAppMode("adventure-select");
            }}
            onSkip={() => {
              setStore((s) => markIntroSeen(s));
              setAppMode("adventure-select");
            }}
          />
        )}

        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          aria-label={muted ? "Unmute sound effects" : "Mute sound effects"}
          className="absolute top-4 right-4 z-30 bg-card/85 backdrop-blur-md rounded-full p-2.5 shadow-card hover:scale-110 transition-transform pointer-events-auto"
          style={{ display: appMode === "endless" && endlessState === "playing" ? "none" : "block" }}
        >
          {muted ? <VolumeX className="w-5 h-5 text-primary-deep" /> : <Volume2 className="w-5 h-5 text-primary-deep" />}
        </button>

        {/* HOME MENU */}
        {appMode === "home" && endlessState === "menu" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-primary-deep/40 backdrop-blur-sm animate-fade-in">
            <div className="bg-card/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 max-w-md mx-4 text-center shadow-glow animate-scale-in">
              <div className="text-6xl mb-2 animate-float">🌸</div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold bg-gradient-magical bg-clip-text text-transparent mb-1">
                Lila's Adventure
              </h2>
              <p className="text-muted-foreground mb-5 text-sm">
                Pick your journey — explore enchanted levels or run forever through the seasons.
              </p>

              <div className="space-y-3 mb-4">
                <button
                  onClick={() => setAppMode(store.seenIntro ? "adventure-select" : "adventure-intro")}
                  className="w-full p-4 rounded-2xl bg-gradient-magical text-primary-foreground shadow-soft hover:scale-[1.02] transition-transform text-left flex items-center gap-3"
                >
                  <div className="text-3xl">🗺️</div>
                  <div className="flex-1">
                    <div className="font-display font-bold text-lg leading-tight">Adventure Mode</div>
                    <div className="text-xs opacity-90">Save Princess Petal from Morvain 🧙‍♂️</div>
                  </div>
                  <div className="text-xl">→</div>
                </button>

                <div className="rounded-2xl bg-secondary/60 p-3">
                  <button
                    onClick={handleEndlessStart}
                    disabled={!ready}
                    className="w-full text-left flex items-center gap-3 disabled:opacity-50"
                  >
                    <div className="text-3xl">🏃‍♀️</div>
                    <div className="flex-1">
                      <div className="font-display font-bold text-base text-primary-deep leading-tight">Endless Runner</div>
                      <div className="text-xs text-muted-foreground">{ready ? "Run forever, beat your best!" : "Loading..."}</div>
                    </div>
                    <div className="text-lg text-primary-deep">→</div>
                  </button>

                  <div className="mt-3 grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-xl">
                    <button
                      onClick={() => setMode("walk")}
                      className={`py-1.5 px-2 rounded-lg font-display font-semibold text-xs transition-all ${
                        mode === "walk"
                          ? "bg-gradient-leaf text-accent-foreground shadow-card"
                          : "text-muted-foreground"
                      }`}
                    >🚶‍♀️ Walk</button>
                    <button
                      onClick={() => setMode("run")}
                      className={`py-1.5 px-2 rounded-lg font-display font-semibold text-xs transition-all ${
                        mode === "run"
                          ? "bg-gradient-magical text-primary-foreground shadow-card"
                          : "text-muted-foreground"
                      }`}
                    >🏃‍♀️ Run</button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                <div>💎 <span className="font-bold text-primary-deep">{store.gems}</span></div>
                {highScore > 0 && (
                  <div>Best: <span className="font-bold text-primary-deep">{highScore}</span></div>
                )}
                <button
                  onClick={() => setShopOpen(true)}
                  className="font-display font-semibold text-primary hover:underline"
                >🛍️ Shop</button>
              </div>
            </div>
          </div>
        )}

        {/* ENDLESS GAME OVER */}
        {appMode === "endless" && endlessState === "over" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-primary-deep/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-card/95 backdrop-blur-xl rounded-3xl p-8 sm:p-10 max-w-md mx-4 text-center shadow-glow animate-scale-in">
              <div className="text-5xl mb-2">🌷</div>
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-primary-deep mb-1">Lovely run!</h2>
              <p className="text-muted-foreground mb-6 text-sm">Lila tripped on something — try again?</p>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-gradient-gold rounded-2xl p-4">
                  <div className="text-xs uppercase tracking-wider text-gold-foreground/80 font-semibold">Score</div>
                  <div className="text-3xl font-display font-bold text-gold-foreground tabular-nums">{lastScore}</div>
                </div>
                <div className="bg-gradient-leaf rounded-2xl p-4">
                  <div className="text-xs uppercase tracking-wider text-accent-foreground/80 font-semibold">Best</div>
                  <div className="text-3xl font-display font-bold text-accent-foreground tabular-nums">{highScore}</div>
                </div>
              </div>

              {lastScore >= highScore && lastScore > 0 && (
                <div className="text-accent font-semibold mb-4 animate-pulse">🏆 New best score!</div>
              )}

              <Button
                size="lg"
                onClick={handleEndlessStart}
                className="w-full text-lg font-display font-bold bg-gradient-magical hover:opacity-90 hover:scale-105 transition-all shadow-soft h-14 rounded-2xl"
              >Play Again ✨</Button>
              <Button
                variant="ghost"
                onClick={() => { setEndlessState("menu"); setAppMode("home"); }}
                className="w-full mt-2 font-display"
              >Back to Menu</Button>
            </div>
          </div>
        )}

        {/* ADVENTURE LEVEL COMPLETE */}
        {appMode === "adventure-result" && lastResult && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-primary-deep/50 backdrop-blur-sm animate-fade-in z-20">
            <div className="bg-card/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 max-w-md mx-4 text-center shadow-glow animate-scale-in">
              <div className="text-5xl mb-2 animate-float">🏆</div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-primary-deep mb-1">Level Complete!</h2>
              <p className="text-muted-foreground text-sm mb-5">{lastResult.level.emoji} {lastResult.level.name}</p>

              <div className="grid grid-cols-3 gap-2 mb-5">
                <div className="bg-secondary rounded-2xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Time</div>
                  <div className="text-lg font-display font-bold text-soil tabular-nums">{(lastResult.timeMs / 1000).toFixed(1)}s</div>
                </div>
                <div className="bg-accent-soft rounded-2xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-accent font-semibold">Gems</div>
                  <div className="text-lg font-display font-bold text-accent tabular-nums">{lastResult.gemsCollected}</div>
                </div>
                <div className="bg-gradient-gold rounded-2xl p-3">
                  <div className="text-[10px] uppercase tracking-wider text-gold-foreground/85 font-semibold">+Earned</div>
                  <div className="text-lg font-display font-bold text-gold-foreground tabular-nums">💎 {lastResult.gemsAwarded}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setAppMode("adventure-select")}
                  className="flex-1 font-display"
                >Levels</Button>
                <Button
                  onClick={() => setShopOpen(true)}
                  className="flex-1 font-display bg-gradient-gold text-gold-foreground hover:opacity-90"
                >🛍️ Shop</Button>
                <Button
                  onClick={() => setAppMode("adventure-select")}
                  className="flex-[1.2] font-display bg-gradient-magical text-primary-foreground"
                >Next →</Button>
              </div>
            </div>
          </div>
        )}

        <AdventureShop open={shopOpen} onOpenChange={setShopOpen} store={store} setStore={setStore} />
      </div>
    </main>
  );
};

export default Index;
