import { useStore } from 'zustand';
import { useAccountStore } from './useAccountStore.js';
import { useShopStore } from './useShopStore.js';
import { useCloudShopStore } from './useCloudShopStore.js';

/** Demo state stays isolated; cloud data is an in-memory projection of Supabase. */
export function useActiveShopStore(selector) {
    const mode = useAccountStore(state => state.dataMode);
    // useShallow has one cache per selector. Reading both stores with that same
    // selector alternates its cache and gives React unstable snapshots.
    // One hook subscribes to the selected store and switches when mode changes.
    return useStore(mode === 'supabase' ? useCloudShopStore : useShopStore, selector);
}
