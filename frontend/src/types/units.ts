/** Fixed picklist, not free text -- mirrors backend/app/models/
 * raw_material.py's RAW_MATERIAL_UNITS and backend/app/models/product.py's
 * PRODUCT_UNITS. See RAW_MATERIAL_UNITS' comment there for why this is a
 * short, catalog-specific list rather than a general unit library. */
export const RAW_MATERIAL_UNITS = ['kg', '20kg', '25kg', 'ton', 'ml', 'litre', 'pcs'] as const
export type RawMaterialUnit = (typeof RAW_MATERIAL_UNITS)[number]

/** Same list minus 'pcs' -- finished goods/sub-assemblies in this catalog
 * are weight- or volume-based, never counted in pieces. */
export const PRODUCT_UNITS = ['kg', '20kg', '25kg', 'ton', 'ml', 'litre'] as const
export type ProductUnit = (typeof PRODUCT_UNITS)[number]
