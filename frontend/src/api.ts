import axios from 'axios'

// Bendras axios klientas. Bazinis URL iš .env (VITE_API_URL).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { Accept: 'application/json' },
})

// Išskleidžia Laravel validacijos klaidą į tekstą
export const errText = (e: unknown): string => {
  if (axios.isAxiosError(e) && e.response?.data) {
    const d = e.response.data as { message?: string; errors?: Record<string, string[]> }
    if (d.errors) return Object.values(d.errors).flat().join(' ')
    return d.message ?? 'Klaida'
  }
  return 'Klaida jungiantis prie API'
}

export interface Paginated<T> {
  data: T[]
  total: number
  current_page: number
  last_page: number
}

export interface RawMaterial {
  id: number
  name: string
  unit: string
  requires_batch: boolean
  is_active: boolean
}

export interface Warehouse {
  id: number
  name: string
  is_active: boolean
}

export interface Shop {
  id: number
  name: string
  is_active: boolean
}

export interface ProductionProduct {
  id: number
  name: string
  is_active: boolean
}

export interface PackedProduct {
  id: number
  name: string
  production_product_id: number
  weight_from_kg: number | null
  weight_to_kg: number | null
  is_active: boolean
}

export interface LWeek {
  id: number
  code: string
  week_number: number
  year: number
}

export interface Recipe {
  id: number
  production_product_id: number
  version: number
  valid_from: string
  valid_to: string | null
  change_reason: string | null
  production_product?: ProductionProduct
  items?: RecipeItem[]
}

export interface RecipeItem {
  id: number
  recipe_id: number
  raw_material_id: number
  qty_kg_per_kg: number
  raw_material?: RawMaterial
}

export interface MaterialBatch {
  id: number
  received_date: string
  raw_material_id: number
  batch_number: string
  qty_received_kg: number
  supplier: string | null
  invoice_number: string | null
  expiry_date: string
  notes: string | null
  balance_kg?: number
  days_to_expiry?: number
  raw_material?: RawMaterial
}

export interface Production {
  id: number
  production_date: string
  production_product_id: number
  qty_produced_kg: number
  l_week_id: number
  recipe_id: number | null
  notes: string | null
  production_product?: ProductionProduct
  l_week?: LWeek
  usages?: MaterialUsage[]
}

export interface MaterialUsage {
  id: number
  production_id: number
  raw_material_id: number
  material_batch_id: number | null
  qty_kg: number
  raw_material?: RawMaterial
  material_batch?: MaterialBatch | null
  production?: Production
}

export interface MaterialOutflow {
  id: number
  outflow_date: string
  material_batch_id: number
  qty_kg: number
  outflow_type: 'transfer' | 'writeoff'
  destination: string | null
  document_number: string | null
  notes: string | null
  material_batch?: MaterialBatch
}

export interface ProductMovement {
  id: number
  movement_date: string
  movement_type: 'pack_in' | 'move' | 'ship_out'
  l_week_id: number
  packed_product_id: number
  qty_units: number
  qty_kg: number
  warehouse_from_id: number | null
  warehouse_to_id: number | null
  shop_id: number | null
  document_number: string | null
  notes: string | null
  l_week?: LWeek
  packed_product?: PackedProduct
  warehouse_from?: Warehouse | null
  warehouse_to?: Warehouse | null
  shop?: Shop | null
}

export interface HealthResponse {
  status: string
  app: string
  database: string
}

export interface WarehouseStockRow {
  packed_product: string
  l_week: string
  warehouse: string
  qty_units: number
  qty_kg: number
}

export interface DashboardData {
  produced_kg: number
  productions: number
  batches_active: number
  shipped_kg: number
  expiring_soon: MaterialBatch[]
  shortages: MaterialUsage[]
}

export interface TraceLWeekResult {
  l_week: LWeek
  materials: MaterialUsage[]
  movements: ProductMovement[]
}

export interface TraceBatchResult {
  batch: MaterialBatch & { balance_kg: number }
  usages: MaterialUsage[]
  movements: ProductMovement[]
}

// ---- Klasifikatoriai ----
export const getHealth = () => api.get<HealthResponse>('/health')
export const getRawMaterials = () => api.get<Paginated<RawMaterial>>('/raw-materials')
export const getWarehouses = () => api.get<Paginated<Warehouse>>('/warehouses')
export const getShops = () => api.get<Paginated<Shop>>('/shops')
export const getPackedProducts = () => api.get<Paginated<PackedProduct>>('/packed-products')
export const getProductionProducts = () => api.get<Paginated<ProductionProduct>>('/production-products')
export const getLWeeks = () => api.get<Paginated<LWeek>>('/l-weeks')
export const getRecipes = () => api.get<Recipe[]>('/recipes')
export const createClassifier = (resource: string, data: object) => api.post(`/${resource}`, data)

// ---- Žaliavų apskaita ----
export const getBatches = () => api.get<Paginated<MaterialBatch>>('/material-batches')
export const createBatch = (data: object) => api.post<MaterialBatch>('/material-batches', data)
export const getProductions = () => api.get<Paginated<Production>>('/productions')
export const createProduction = (data: object) => api.post<Production>('/productions', data)
export const getOutflows = () => api.get<Paginated<MaterialOutflow>>('/material-outflows')
export const createOutflow = (data: object) => api.post<MaterialOutflow>('/material-outflows', data)

// ---- Produkto judėjimai ----
export const getMovements = (type?: string) =>
  api.get<Paginated<ProductMovement>>('/product-movements', { params: type ? { type } : {} })
export const createMovement = (data: object) => api.post<ProductMovement>('/product-movements', data)

// ---- Atsekamumas ----
export const traceBatch = (id: number) => api.get<TraceBatchResult>(`/traceability/batch/${id}`)
export const traceLWeek = (code: string) => api.get<TraceLWeekResult>(`/traceability/l-week/${code}`)

// ---- Ataskaitos ----
export const getDashboard = () => api.get<DashboardData>('/reports/dashboard')
export const getBatchBalances = () => api.get<MaterialBatch[]>('/reports/batch-balances')
export const getWarehouseStock = () => api.get<WarehouseStockRow[]>('/reports/warehouse-stock')
export const getShipments = () => api.get<{ shop: string; qty_units: number; qty_kg: number; shipments: number }[]>('/reports/shipments')
export const suggestPack = (weightKg: number) =>
  api.get<PackedProduct>('/suggest-pack', { params: { weight_kg: weightKg } })
