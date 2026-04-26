import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  onFinish: () => void;
  onSkip: () => void;
}

interface Panel {
  emoji: string;
  title: string;
  text: string;
  bg: string;
}

const PANELS: Panel[] = [
  {
    emoji: "🌸",
    title: "Once upon a meadow…",
    text: "Lila and her dearest friend, Princess Petal, played all day in the castle gardens — chasing butterflies and weaving flower crowns.",
    bg: "from-primary/40 to-accent/30",
  },
  {
    emoji: "🌩️",
    title: "Then the sky turned dark.",
    text: "A cold wind swept through the kingdom. Shadows crept between the roses, and a wicked laugh echoed across the hills…",
    bg: "from-primary-deep/70 to-soil/60",
  },
  {
    emoji: "🧙‍♂️",
    title: "Morvain, the Shadow Sorcerer.",
    text: "He stole Princess Petal away to his crooked tower — and swore Lila would never see her friend again.",
    bg: "from-soil/70 to-primary-deep/80",
  },
  {
    emoji: "✨",
    title: "But Lila is brave.",
    text: "With courage in her heart, she set off across enchanted lands — past snakes, zombies, and the Sorcerer's own dark minions — to bring her friend home.",
    bg: "from-accent/40 to-primary/40",
  },
];

export const StoryIntro = ({ onFinish, onSkip }: Props) => {
  const [idx, setIdx] = useState(0);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    setEntered(false);
    const t = setTimeout(() => setEntered(true), 30);
    return () => clearTimeout(t);
  }, [idx]);

  const next = () => {
    if (idx < PANELS.length - 1) setIdx(idx + 1);
    else onFinish();
  };

  const panel = PANELS[idx];

  return (
    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${panel.bg} flex items-center justify-center p-4 sm:p-8 overflow-hidden animate-fade-in`}>
      {/* Floating ambient sparkles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {Array.from({ length: 18 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1.5 h-1.5 rounded-full bg-primary-foreground/40 animate-float"
            style={{
              left: `${(i * 53) % 100}%`,
              top: `${(i * 37) % 100}%`,
              animationDelay: `${(i % 6) * 0.3}s`,
              animationDuration: `${3 + (i % 4)}s`,
            }}
          />
        ))}
      </div>

      <div
        key={idx}
        className={`relative max-w-lg w-full bg-card/95 backdrop-blur-xl rounded-3xl p-6 sm:p-8 text-center shadow-glow transition-all duration-500 ${
          entered ? "opacity-100 translate-y-0 scale-100" : "opacity-0 translate-y-4 scale-95"
        }`}
      >
        <div className="text-7xl sm:text-8xl mb-3 animate-float" aria-hidden="true">{panel.emoji}</div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold bg-gradient-magical bg-clip-text text-transparent mb-3">
          {panel.title}
        </h2>
        <p className="text-foreground/80 text-sm sm:text-base leading-relaxed mb-6">
          {panel.text}
        </p>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 mb-5">
          {PANELS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === idx ? "w-6 bg-primary" : i < idx ? "w-1.5 bg-primary/50" : "w-1.5 bg-muted"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            onClick={onSkip}
            className="font-display text-muted-foreground"
          >
            Skip
          </Button>
          <Button
            onClick={next}
            className="flex-1 font-display font-bold bg-gradient-magical text-primary-foreground shadow-soft hover:scale-[1.02] transition-transform"
          >
            {idx < PANELS.length - 1 ? "Next →" : "Begin Adventure ✨"}
          </Button>
        </div>
      </div>
    </div>
  );
};
