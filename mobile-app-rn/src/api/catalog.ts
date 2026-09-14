import { api } from './client';

// Mirrors backend/app/schemas/product.py's ProductOut. listProducts is
// used both as a lightweight picker source (New Quotation / Order line
// items -- only id/code/name/selling_price actually read there) and as
// the Product Catalog screen's own data source, so it carries every
// field either caller needs.
export interface Product {
  id: number;
  code: string;
  name: string;
  unit: string;
  category: string | null;
  description: string | null;
  product_type: 'finished_good' | 'sub_assembly';
  selling_price: number;
  status: 'active' | 'inactive';
  tags: string[] | null;
  reorder_point: number;
}

interface PagedResponse<T> {
  items: T[];
  total: number;
}

export function listProducts(params: { search?: string; category?: string; status?: string } = {}) {
  const query = new URLSearchParams();
  query.set('page', '1');
  query.set('page_size', '200');
  query.set('sort', 'name');
  if (params.search) query.set('search', params.search);
  if (params.category) query.set('category', params.category);
  if (params.status) query.set('status', params.status);
  return api<PagedResponse<Product>>(`/api/products?${query.toString()}`);
}
