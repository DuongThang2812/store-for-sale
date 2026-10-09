const indexes = new WeakMap();

// The store replaces the products array whenever stock or pricing changes.
export function findProduct(products, id) {
    let index = indexes.get(products);
    if (!index) {
        index = new Map();
        for (const product of products) {
            if (!index.has(product.id)) index.set(product.id, product);
        }
        indexes.set(products, index);
    }
    return index.get(id);
}
