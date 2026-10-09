import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { useShallow } from 'zustand/react/shallow';
import { useActiveShopStore } from '../src/stores/useActiveShopStore.js';
import { useAccountStore } from '../src/stores/useAccountStore.js';
import { useShopStore } from '../src/stores/useShopStore.js';
import { useCloudShopStore } from '../src/stores/useCloudShopStore.js';

// Server rendering exercises the real React/Zustand hooks without operating
// a user's browser. Only the fixture's account snapshot is overridden.
function renderInMode(mode, component) {
    const snapshot = useAccountStore.getInitialState();
    const originalMode = snapshot.dataMode;
    snapshot.dataMode = mode;
    try { return renderToStaticMarkup(createElement(component)); }
    finally { snapshot.dataMode = originalMode; }
}

for (const mode of ['demo', 'supabase']) {
    test(`${mode} page evaluates a shallow selector only against its active source`, () => {
        const expected = (mode === 'supabase' ? useCloudShopStore : useShopStore).getInitialState();
        let reads = 0;
        function Page() {
            const selected = useActiveShopStore(useShallow(state => {
                assert.equal(state, expected, 'Inactive source must not overwrite the shared shallow cache');
                reads++;
                return { products: state.products, customers: state.customers, entries: state.entries };
            }));
            assert.equal(selected.products, expected.products);
            return createElement('span', null, mode);
        }
        assert.equal(renderInMode(mode, Page), `<span>${mode}</span>`);
        assert.equal(reads, 1);
    });
}

test('active source selection retains the no-selector API used by cancellation dialogs', () => {
    for (const mode of ['demo', 'supabase']) {
        function Page() {
            const state = useActiveShopStore();
            assert.equal(state, (mode === 'supabase' ? useCloudShopStore : useShopStore).getInitialState());
            return null;
        }
        renderInMode(mode, Page);
    }
});
