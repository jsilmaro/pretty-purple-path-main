import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SHOP_ITEMS, type AdventureStore, type CosmeticId, buyItem, equipItem, unequipCategory } from "@/lib/adventureStore";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  store: AdventureStore;
  setStore: (s: AdventureStore) => void;
}

const CATEGORIES: { key: "tint" | "accessory" | "trail"; label: string; emoji: string }[] = [
  { key: "tint", label: "Outfit Tint", emoji: "🎨" },
  { key: "accessory", label: "Accessories", emoji: "💎" },
  { key: "trail", label: "Trails", emoji: "✨" },
];

export const AdventureShop = ({ open, onOpenChange, store, setStore }: Props) => {
  const handleBuy = (id: CosmeticId) => {
    const next = buyItem(store, id);
    if (next) setStore(next);
  };
  const handleEquip = (id: CosmeticId) => {
    setStore(equipItem(store, id));
  };
  const handleUnequip = (cat: "accessory" | "trail") => {
    setStore(unequipCategory(store, cat));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-primary/20">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl text-primary-deep flex items-center justify-between">
            <span>🛍️ Lila's Boutique</span>
            <span className="flex items-center gap-1.5 text-base font-bold bg-gradient-gold text-gold-foreground px-3 py-1 rounded-full">
              💎 {store.gems}
            </span>
          </DialogTitle>
          <DialogDescription>
            Spend gems on cosmetics. They show up in both Adventure and Endless modes!
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {CATEGORIES.map((cat) => {
            const items = SHOP_ITEMS.filter((i) => i.category === cat.key);
            const equipped = store.equipped[cat.key];
            return (
              <section key={cat.key}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-display font-bold text-primary-deep flex items-center gap-2">
                    <span>{cat.emoji}</span> {cat.label}
                  </h3>
                  {(cat.key === "accessory" || cat.key === "trail") && equipped && (
                    <button
                      onClick={() => handleUnequip(cat.key as "accessory" | "trail")}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground underline"
                    >
                      Unequip
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {items.map((item) => {
                    const owned = store.owned.includes(item.id);
                    const isEquipped = equipped === item.id;
                    const canAfford = store.gems >= item.price;
                    return (
                      <div
                        key={item.id}
                        className={`rounded-2xl p-3 border-2 transition-all ${
                          isEquipped
                            ? "border-primary bg-primary/10 shadow-card"
                            : owned
                            ? "border-accent/50 bg-accent-soft/40"
                            : "border-border bg-secondary/40"
                        }`}
                      >
                        <div className="text-3xl text-center mb-1">{item.emoji}</div>
                        <div className="font-display font-bold text-sm text-primary-deep text-center leading-tight">{item.name}</div>
                        <div className="text-[10px] text-muted-foreground text-center mb-2 line-clamp-2 min-h-[24px]">{item.description}</div>
                        {owned ? (
                          <button
                            onClick={() => handleEquip(item.id)}
                            disabled={isEquipped}
                            className={`w-full py-1.5 rounded-xl text-xs font-display font-bold transition-colors ${
                              isEquipped
                                ? "bg-primary text-primary-foreground cursor-default"
                                : "bg-gradient-leaf text-accent-foreground hover:opacity-90"
                            }`}
                          >
                            {isEquipped ? "Equipped ✓" : "Equip"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleBuy(item.id)}
                            disabled={!canAfford}
                            className={`w-full py-1.5 rounded-xl text-xs font-display font-bold transition-all ${
                              canAfford
                                ? "bg-gradient-gold text-gold-foreground hover:scale-[1.02] shadow-card"
                                : "bg-muted text-muted-foreground cursor-not-allowed"
                            }`}
                          >
                            💎 {item.price}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};
