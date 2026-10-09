import { create } from 'zustand';
export const useCartStore = create((set, get) => ({
    items: [],
    addItem: (product) => {
        set((state) => {
            const existing = state.items.find(i => i.id === product.id);
            if (existing) {
                if (existing.quantity >= product.stock)
                    return state;
                return {
                    items: state.items.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
                };
            }
            return { items: [...state.items, { ...product, quantity: 1 }] };
        });
    },
    removeItem: (productId) => {
        set((state) => ({ items: state.items.filter(i => i.id !== productId) }));
    },
    updateQuantity: (productId, quantity) => {
        set((state) => {
            if (quantity <= 0) {
                return { items: state.items.filter(i => i.id !== productId) };
            }
            return {
                items: state.items.map(i => {
                    if (i.id === productId) {
                        const finalQuantity = Math.min(quantity, i.stock);
                        return { ...i, quantity: finalQuantity };
                    }
                    return i;
                })
            };
        });
    },
    clearCart: () => set({ items: [] }),
    get totalAmount() {
        return get().items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    },
    get totalItems() {
        return get().items.reduce((sum, item) => sum + item.quantity, 0);
    }
}));
