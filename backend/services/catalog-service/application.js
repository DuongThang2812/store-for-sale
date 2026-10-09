import { ApiError } from '../../shared/errors.js';
export function createCatalogApplication(repository) {
    return {
        ...repository,
        async saveProduct(actor,input,id=null) {
            if (id && (Object.hasOwn(input,'openingStock') || !input.expectedVersion)) throw new ApiError('INVALID_REQUEST',400);
            if (new Set(input.units.map(unit=>unit.key)).size!==input.units.length) throw new ApiError('UNIT_INVALID',400);
            return repository.saveProduct(actor,input,id);
        },
    };
}
