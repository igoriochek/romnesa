import axios from 'axios'

// Bendras axios klientas. Bazinis URL iš .env (VITE_API_URL).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  headers: { Accept: 'application/json' },
})

const primaryApiUrl: string = import.meta.env.VITE_API_URL ?? '/api'
const localApiUrl: string | undefined = import.meta.env.VITE_LOCAL_API_URL

const isUp = (base: string, timeout: number) =>
  axios.get(`${base}/health`, { timeout }).then(() => true, () => false)

let switchingToLocal: Promise<boolean> | null = null

const useLocalIfUp = (): Promise<boolean> => {
  if (!localApiUrl) return Promise.resolve(false)
  switchingToLocal ??= isUp(localApiUrl, 60000).then((up) => {
    if (up) api.defaults.baseURL = localApiUrl
    else switchingToLocal = null
    return up
  })
  return switchingToLocal
}

const apiReady: Promise<unknown> = localApiUrl
  ? isUp(primaryApiUrl, 5000).then((up) => (up ? true : useLocalIfUp()))
  : Promise.resolve()

// ---- Prisijungimas (Sanctum žetonas localStorage) ----
const TOKEN_KEY = 'romnesa_token'

export const getToken = (): string | null => {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

const setToken = (token: string | null) => {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // privatus režimas - liks tik šiai sesijai
  }
}

// App klausosi - pasibaigus žetonui grąžina į prisijungimo langą
export const AUTH_EXPIRED_EVENT = 'romnesa:auth-expired'

api.interceptors.request.use(async (config) => {
  await apiReady
  config.baseURL = api.defaults.baseURL
  const token = getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Serveris reikalauja pakeisti numatytąjį slaptažodį - App parodo keitimo langą
export const PASSWORD_CHANGE_EVENT = 'romnesa:password-change-required'

api.interceptors.response.use(undefined, async (error) => {
  if (error?.response?.status === 401 && getToken()) {
    setToken(null)
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
  }
  if (error?.response?.status === 403 && error.response.data?.code === 'password_change_required') {
    window.dispatchEvent(new Event(PASSWORD_CHANGE_EVENT))
  }
  return Promise.reject(error)
})

api.interceptors.response.use(undefined, async (error) => {
  const cfg = error?.config as (typeof error.config & { _retriedLocal?: boolean }) | undefined
  // Rašymo užklausų nekartojam po 5xx - serveris galėjo jau įrašyti (būtų dublikatas kitoje DB)
  const serverFailed = !error?.response || (error.response.status >= 500 && cfg?.method === 'get')
  if (cfg && !cfg._retriedLocal && serverFailed && api.defaults.baseURL !== localApiUrl && (await useLocalIfUp())) {
    cfg._retriedLocal = true
    cfg.baseURL = localApiUrl
    return api.request(cfg)
  }
  return Promise.reject(error)
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
  code: string | null
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
  productions_count?: number
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
  warehouse_id: number | null
  batch_number: string
  qty_received_kg: number
  unit_cost_eur: number | null  // savikaina, EUR/kg
  supplier: string | null
  invoice_number: string | null
  expiry_date: string
  notes: string | null
  is_locked?: boolean
  balance_kg?: number
  used_kg?: number
  outflow_kg?: number
  days_to_expiry?: number
  total_cost_eur?: number | null     // gauta kg × savikaina
  balance_value_eur?: number | null  // likutis kg × savikaina
  raw_material?: RawMaterial
  warehouse?: Warehouse | null
  usages?: MaterialUsage[]      // tik GET /material-batches/{id}
  outflows?: MaterialOutflow[]  // tik GET /material-batches/{id}
  created_at?: string
}

export interface Production {
  id: number
  production_date: string
  production_product_id: number
  qty_produced_kg: number
  l_week_id: number
  recipe_id: number | null
  notes: string | null
  is_locked?: boolean
  // Žaliavų savikaina (CostService): faktinė pagal partijų kainas + įvertinta, kur kaina dar neįvesta
  cost_actual_eur?: number
  cost_estimated_eur?: number
  cost_eur?: number | null        // null - kuriai nors žaliavai kaina neįvesta niekada
  cost_per_kg_eur?: number | null
  cost_complete?: boolean         // true - visos partijos įkainotos, nieko netrūko (be įverčių)
  priced_share?: number           // 0..1 - kg dalis su faktine partijos kaina
  cost_materials?: CostMaterial[] // tik detalėje
  production_product?: ProductionProduct
  l_week?: LWeek
  usages?: MaterialUsage[]
  // tik detalėje: gamybos dieną galiojusios mėnesio korekcijos
  adjustments?: { raw_material: string; base_qty_kg_per_kg: number | null; qty_kg_per_kg: number }[]
}

export interface CostMaterial {
  raw_material_id: number
  raw_material: string | null
  qty_kg: number
  cost_eur: number | null
  unit_cost_eur: number | null
  estimated: boolean       // dalis įvertinta orientacine kaina
  missing_price: boolean   // kainos nėra iš viso
  share_pct: number | null
}

/** Receptūrinė savikaina 1 kg produkto pagal orientacines (paskutines žinomas) kainas. */
export interface RecipeCost {
  date: string
  items: { raw_material_id: number; raw_material: string | null; qty_kg_per_kg: number; unit_cost_eur: number | null; cost_per_kg_eur: number | null }[]
  cost_per_kg_eur: number
  complete: boolean
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
  outflow_type: 'transfer' | 'writeoff' | 'kitchen'
  reason: WriteoffReason | null
  writeoff_act_id: number | null
  destination: string | null
  document_number: string | null
  notes: string | null
  is_locked?: boolean
  value_eur?: number | null   // kg × partijos savikaina
  material_batch?: MaterialBatch
  writeoff_act?: { id: number; act_number: string } | null
}

// Nurašymo priežastys (backend MaterialOutflow::REASONS)
export const WRITEOFF_REASONS = {
  expired: 'Pasibaigęs galiojimas',
  damaged: 'Sugadinta / nekokybiška',
  inventory: 'Inventorizacijos skirtumas',
  other: 'Kita',
} as const
export type WriteoffReason = keyof typeof WRITEOFF_REASONS

export interface WriteoffAct {
  id: number
  act_number: string
  act_date: string
  compiled_by: string | null
  approved_by: string | null
  notes: string | null
  is_locked: boolean
  total_kg: number
  total_value_eur: number
  value_complete: boolean
  lines?: number
  outflows?: MaterialOutflow[]   // tik GET /writeoff-acts/{id}
}

export const getWriteoffActs = () => api.get<WriteoffAct[]>('/writeoff-acts')
export const getWriteoffAct = (id: number) => api.get<WriteoffAct>(`/writeoff-acts/${id}`)
export const createWriteoffAct = (data: object) => api.post<WriteoffAct>('/writeoff-acts', data)

export interface ProductMovement {
  id: number
  movement_date: string
  movement_type: 'pack_in' | 'move' | 'ship_out' | 'repack'
  l_week_id: number
  packed_product_id: number
  qty_units: number
  qty_kg: number
  warehouse_from_id: number | null
  warehouse_to_id: number | null
  shop_id: number | null
  document_number: string | null
  notes: string | null
  is_locked?: boolean
  l_week?: LWeek
  packed_product?: PackedProduct
  warehouse_from?: Warehouse | null
  warehouse_to?: Warehouse | null
  shop?: Shop | null
}

export interface HealthResponse {
  status: string
  app: string
}

export interface WarehouseStockRow {
  packed_product: string
  l_week: string
  warehouse: string
  qty_units: number
  qty_kg: number
}

export interface MaterialSummaryRow {
  id: number
  raw_material: string
  received_kg: number
  used_kg: number
  outflow_kg: number
  balance_kg: number
  expired_kg: number
  balance_value_eur: number
  value_complete: boolean
}

export interface DashboardData {
  produced_kg: number
  productions: number
  batches_active: number
  batches_expired: number
  shipped_kg: number
  expiring_soon: MaterialBatch[]
  shortages: MaterialUsage[]
  materials: MaterialSummaryRow[]
  stock_value_eur: number
  updated_at: string
}

export interface ProductInfo {
  product: ProductionProduct & { packed_products: PackedProduct[] }
  recipe: Recipe | null
  recipe_cost: RecipeCost | null
  produced_kg: number
  recent: Production[]
}

// Žaliava be privalomos partijos (pvz. vanduo) - be partijos tai ne trūkumas
export const isShortage = (u: { material_batch_id: number | null; raw_material?: RawMaterial }) =>
  u.material_batch_id === null && u.raw_material?.requires_batch !== false

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

export interface User {
  id: number
  name: string
  username: string
  role: string
  must_change_password?: boolean
}

export const changePassword = (data: { current_password: string; password: string; password_confirmation: string }) =>
  api.post<User>('/change-password', data)

export const login = async (username: string, password: string): Promise<User> => {
  const res = await api.post<{ token: string; user: User }>('/login', { username, password })
  setToken(res.data.token)
  return res.data.user
}

export const getMe = () => api.get<User>('/user')

export const logout = async () => {
  try {
    await api.post('/logout')
  } finally {
    setToken(null)
  }
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
// Visos partijos (iki 1000) - sąrašai ir filtrai veikia naršyklėje
export const getBatches = () => api.get<Paginated<MaterialBatch>>('/material-batches', { params: { per_page: 1000 } })
export const getBatch = (id: number) => api.get<MaterialBatch>(`/material-batches/${id}`)
export const createBatch = (data: object) => api.post<MaterialBatch>('/material-batches', data)
export const updateBatch = (id: number, data: object) => api.put<MaterialBatch>(`/material-batches/${id}`, data)
export const getProductions = (perPage = 50) => api.get<Paginated<Production>>('/productions', { params: { per_page: perPage } })
export const getProduction = (id: number) => api.get<Production>(`/productions/${id}`)
export const createProduction = (data: object) => api.post<Production>('/productions', data)
export const getOutflows = (params?: { type?: 'transfer' | 'writeoff' | 'kitchen'; unassigned?: 1 }) =>
  api.get<Paginated<MaterialOutflow>>('/material-outflows', { params })
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
export interface ReportFilter { from?: string; to?: string; raw_material_id?: number; only_balance?: 1 }
export const getBatchReport = (params: ReportFilter) => api.get<MaterialBatch[]>('/reports/batches', { params })
export const getUsageReport = (params: ReportFilter) =>
  api.get<(MaterialUsage & { unit_cost_eur: number | null; value_eur: number | null })[]>('/reports/usage', { params })
export interface CostSummary {
  productions: number
  qty_produced_kg: number
  cost_eur: number | null
  cost_estimated_eur: number
  cost_per_kg_eur: number | null
  cost_complete: boolean
}
export interface CostReport {
  productions: (Required<Pick<Production, 'id' | 'production_date' | 'qty_produced_kg' | 'cost_actual_eur' | 'cost_estimated_eur' | 'cost_complete' | 'priced_share'>> & {
    product: string | null; l_week: string | null; cost_eur: number | null; cost_per_kg_eur: number | null
  })[]
  by_product: (CostSummary & { product: string })[]
  by_l_week: (CostSummary & { l_week: string; product: string })[]
  by_material: (Omit<CostMaterial, 'raw_material_id'> & { raw_material: string })[]
  totals: CostSummary
  unpriced_batches: number
}
export const getCostReport = (params: { from?: string; to?: string; production_product_id?: number }) =>
  api.get<CostReport>('/reports/cost', { params })
export const getWarehouseStock = () => api.get<WarehouseStockRow[]>('/reports/warehouse-stock')
export const getShipments = () => api.get<{ shop: string; qty_units: number; qty_kg: number; shipments: number }[]>('/reports/shipments')
export const suggestPack = (weightKg: number) =>
  api.get<PackedProduct>('/suggest-pack', { params: { weight_kg: weightKg } })

// ---- Gamybos peržiūra (FIFO planas nerašant) ----
export interface PreviewTake {
  batch: MaterialBatch | null   // null = TRŪKSTA
  qty_kg: number
  available_kg: number
}

export interface ProductionPreview {
  recipe: Recipe
  recipe_cost: RecipeCost
  // options - visos tą dieną tinkamos partijos su likučiu (planą galima keisti rankiniu būdu)
  plan: { raw_material: RawMaterial; needed_kg: number; adjusted?: boolean; base_qty_kg_per_kg?: number | null; qty_kg_per_kg?: number; take: PreviewTake[]; options: MaterialBatch[] }[]
  shortage: boolean
}

export const previewProduction = (data: object) => api.post<ProductionPreview>('/productions/preview', data)
export const getProductInfo = (id: number, params: { production_date?: string; l_week_id?: number }) =>
  api.get<ProductInfo>(`/productions/product-info/${id}`, { params })

// ---- Užraktai (įspajamojimas) ir naikinimas ----
export const toggleLock = (resource: string, id: number) => api.post(`/${resource}/${id}/lock`)
export const deleteRecord = (resource: string, id: number) => api.delete(`/${resource}/${id}`)

// ---- Istorija ----
export interface AuditRow {
  id: number
  entity_type: string
  entity_id: number
  action: 'created' | 'updated' | 'deleted' | 'locked' | 'unlocked'
  label: string | null
  payload: Record<string, unknown> | null
  user?: { id: number; name: string } | null
  created_at: string
}

export const getHistory = (params?: { entity?: string; action?: string; page?: number }) =>
  api.get<Paginated<AuditRow>>('/history', { params })

// ---- Klasifikatorių redagavimas / tvarka ----
export const updateClassifier = (resource: string, id: number, data: object) => api.put(`/${resource}/${id}`, data)
export const reorderClassifier = (resource: string, ids: number[]) => api.post(`/${resource}/reorder`, { ids })

// ---- Receptūros ----
export interface RecipeInput {
  production_product_id: number
  version?: number | null
  valid_from: string
  valid_to?: string | null
  change_reason?: string | null
  items: { raw_material_id: number; qty_kg_per_kg: number }[]
}
export const createRecipe = (data: RecipeInput) => api.post<Recipe>('/recipes', data)
export const updateRecipe = (id: number, data: RecipeInput) => api.put<Recipe>(`/recipes/${id}`, data)

// ---- Pakavimas ----
export const OUTFLOW_TYPES = {
  writeoff: 'Nurašymas',
  transfer: 'Perdavimas kitam cechui',
  kitchen: 'Perdavimas virtuvei',
} as const
export type OutflowType = keyof typeof OUTFLOW_TYPES

export interface PackagingMaterial {
  id: number
  name: string
  unit: string
  kind: 'item' | 'box' | 'overlay'
  pack_qty: number | null
  sort_order?: number
  is_active: boolean
}

export const MATERIAL_KINDS = { item: 'Prekinė pakuotė', box: 'Transportinė dėžė', overlay: 'Perdengimas' } as const

export interface TransportNorm {
  id: number
  packed_product_id: number
  shop_id: number | null
  box_material_id: number
  units_per_box: number | null
  overlay_material_id: number | null
  overlays_per_box: number
  notes: string | null
  sort_order?: number
  packed_product?: PackedProduct
  shop?: Shop | null
  box_material?: PackagingMaterial
  overlay_material?: PackagingMaterial | null
}

export interface PackagingBatch {
  id: number
  received_date: string
  packaging_material_id: number
  batch_number: string
  qty_received: number
  unit_cost_eur: number | null
  supplier: string | null
  invoice_number: string | null
  notes: string | null
  is_locked?: boolean
  used: number
  balance: number
  balance_value_eur: number | null
  packaging_material?: PackagingMaterial
}

export interface PackingSpec {
  id: number
  packed_product_id: number
  packaging_material_id: number
  qty_per_unit: number
  packaging_material?: PackagingMaterial
}

export type PackedProductSpec = PackedProduct & { production_product?: ProductionProduct; specs: PackingSpec[] }

export interface PackingUsage {
  id: number
  packaging_material_id: number
  packaging_batch_id: number | null
  qty: number
  unit_cost_eur: number | null
  cost_eur: number | null
  packaging_material?: PackagingMaterial
  packaging_batch?: PackagingBatch | null
}

export interface Packing {
  id: number
  packing_date: string
  l_week_id: number
  packed_product_id: number
  unit_weight_kg: number
  qty_units: number
  qty_kg: number
  warehouse_id: number
  shop_id: number | null
  boxes: number | null
  source_packed_product_id: number | null
  source_warehouse_id: number | null
  notes: string | null
  is_locked?: boolean
  cost_eur: number
  cost_complete: boolean
  cost_per_unit_eur: number | null
  l_week?: LWeek
  packed_product?: PackedProduct & { production_product?: ProductionProduct }
  warehouse?: Warehouse
  shop?: Shop | null
  source_packed_product?: PackedProduct | null
  source_warehouse?: Warehouse | null
  usages: PackingUsage[]
}

export interface PackagingStockRow {
  packaging_material_id: number
  name: string
  unit: string
  is_active: boolean
  batches: number
  received: number
  used: number
  balance: number
  balance_value_eur: number | null
  value_complete: boolean
}

export const getPackagingMaterials = () => api.get<Paginated<PackagingMaterial>>('/packaging-materials')
export const getPackagingBatches = () => api.get<PackagingBatch[]>('/packaging-batches')
export const createPackagingBatch = (data: object) => api.post<PackagingBatch>('/packaging-batches', data)
export const updatePackagingBatch = (id: number, data: object) => api.put<PackagingBatch>(`/packaging-batches/${id}`, data)
export const getPackagingStock = () => api.get<PackagingStockRow[]>('/packaging-stock')
export const getPackingSpecs = () => api.get<PackedProductSpec[]>('/packing-specs')
export const savePackingSpecs = (packedProductId: number, items: { packaging_material_id: number; qty_per_unit: number }[]) =>
  api.put<PackedProductSpec>(`/packing-specs/${packedProductId}`, { items })
export const getPackings = (params?: { from?: string; to?: string; production_product_id?: number }) =>
  api.get<Packing[]>('/packings', { params })
export const createPacking = (data: object) => api.post<Packing>('/packings', data)

export type TransportNormInput = Omit<TransportNorm, 'id' | 'sort_order' | 'packed_product' | 'shop' | 'box_material' | 'overlay_material'>
export const getTransportNorms = () => api.get<TransportNorm[]>('/transport-norms')
export const createTransportNorm = (data: TransportNormInput) => api.post<TransportNorm>('/transport-norms', data)
export const updateTransportNorm = (id: number, data: TransportNormInput) => api.put<TransportNorm>(`/transport-norms/${id}`, data)
export const reorderTransportNorms = (ids: number[]) => api.post('/transport-norms/reorder', { ids })

// ---- Sunaudojimo perskaičiavimas / partijos pašalinimas su perskirstymu ----
export interface RecalcResult {
  mode: 'shortages' | 'full'
  dry_run: boolean
  productions: number
  no_recipe: number[]
  before: Record<string, number>
  after: Record<string, number>
}
export const recalculateProductions = (data: { mode: 'shortages' | 'full'; dry_run: boolean; from?: string; to?: string; production_product_id?: number; raw_material_id?: number }) =>
  api.post<RecalcResult>('/productions/recalculate', data)
export const deleteBatchReallocate = (id: number) =>
  api.delete<{ productions: number; moved_kg: number; shortages: Record<string, number> }>(`/material-batches/${id}`, { params: { reallocate: 1 } })

// ---- Mėnesio sunaudojimo korekcijos („individuali kortelė“) ----
export interface RecipeAdjustment {
  id: number
  production_product_id: number
  raw_material_id: number
  valid_from: string
  valid_to: string
  qty_kg_per_kg: number
  base_qty_kg_per_kg: number | null
  reason: string | null
  is_locked: boolean
  production_product?: ProductionProduct
  raw_material?: RawMaterial
}
export type RecipeAdjustmentInput = Pick<RecipeAdjustment, 'production_product_id' | 'raw_material_id' | 'valid_from' | 'valid_to' | 'qty_kg_per_kg' | 'reason'>
export interface AdjustmentContext {
  productions: number
  locked: number
  produced_kg: number
  base_qty_kg_per_kg: number | null
  recipe_version: number | null
  used_kg: number
  shortage_kg: number
}
export const getRecipeAdjustments = (params?: { from?: string; to?: string; production_product_id?: number }) =>
  api.get<RecipeAdjustment[]>('/recipe-adjustments', { params })
export const getAdjustmentContext = (params: { production_product_id: number; raw_material_id: number; from: string; to: string }) =>
  api.get<AdjustmentContext>('/recipe-adjustments/context', { params })
export const createRecipeAdjustment = (data: RecipeAdjustmentInput) => api.post<RecipeAdjustment>('/recipe-adjustments', data)
export const updateRecipeAdjustment = (id: number, data: RecipeAdjustmentInput) => api.put<RecipeAdjustment>(`/recipe-adjustments/${id}`, data)
export const lockRecipeAdjustment = (id: number) => api.post<RecipeAdjustment>(`/recipe-adjustments/${id}/lock`)
export const deleteRecipeAdjustment = (id: number) => api.delete(`/recipe-adjustments/${id}`)

// ---- Darbo užmokestis (DU) ----
export type Workshop = 'sakociai' | 'kulinarija'
export type WorkStage = 'eggs' | 'mixing' | 'baking' | 'packing' | 'barcoding' | 'other'
export interface Worker { id: number; name: string; position: string | null; workshop: Workshop; is_active: boolean }
export interface WorkOperation {
  id: number
  workshop: Workshop
  stage: WorkStage
  name: string
  pay_basis: 'hours' | 'qty'
  unit: 'val' | 'vnt' | 'kg' | 'm' | 't'
  norm_kg: number | null
  is_active: boolean
}
export interface WorkRate {
  id: number
  work_operation_id: number
  worker_id: number | null
  rate: number
  rate_2nd: number | null
  valid_from: string
  valid_to: string | null
  notes: string | null
  operation?: WorkOperation
  worker?: Worker | null
}
export interface WorkEntryDetails {
  buckets_full?: number
  partial_kg?: number
  eggs_count?: number
  mass_kg?: number
  egg_avg_g?: number
  mixes?: number
  kg_per_mix?: number
  start?: string
  end?: string
  break_min?: number
  units?: number
  document?: string
  destination?: string
  defect_kg?: number
  rate_2nd_applied?: number
}
export interface WorkEntry {
  id: number
  work_date: string
  worker_id: number
  work_operation_id: number
  production_product_id: number | null
  l_week_id: number | null
  shift: string | null
  qty: number | null
  hours: number | null
  details: WorkEntryDetails | null
  rate_applied: number | null
  amount: number | null
  is_locked: boolean
  notes: string | null
  warnings: string[]
  worker?: Worker
  operation?: WorkOperation
  production_product?: ProductionProduct | null
  l_week?: LWeek | null
}
export interface WorkSummaryRow {
  worker: { id: number; name: string; position: string | null; workshop: Workshop }
  hours: number
  amount: number
  entries: number
  unapproved: number
  warnings: number
  operations: { name: string; unit: string; basis: 'hours' | 'qty'; qty: number; hours: number; amount: number }[]
}
export const getWorkers = () => api.get<Worker[]>('/workers')
export const saveWorker = (data: Omit<Worker, 'id'>, id?: number) => (id ? api.put<Worker>(`/workers/${id}`, data) : api.post<Worker>('/workers', data))
export const deleteWorker = (id: number) => api.delete(`/workers/${id}`)
export const getWorkOperations = () => api.get<WorkOperation[]>('/work-operations')
export const saveWorkOperation = (data: Omit<WorkOperation, 'id'>, id?: number) =>
  (id ? api.put<WorkOperation>(`/work-operations/${id}`, data) : api.post<WorkOperation>('/work-operations', data))
export const deleteWorkOperation = (id: number) => api.delete(`/work-operations/${id}`)
export const getWorkRates = () => api.get<WorkRate[]>('/work-rates')
export const saveWorkRate = (data: Omit<WorkRate, 'id' | 'operation' | 'worker'>, id?: number) =>
  (id ? api.put<WorkRate>(`/work-rates/${id}`, data) : api.post<WorkRate>('/work-rates', data))
export const deleteWorkRate = (id: number) => api.delete(`/work-rates/${id}`)
export const getWorkEntries = (params: { from?: string; to?: string; worker_id?: number; workshop?: Workshop }) =>
  api.get<WorkEntry[]>('/work-entries', { params })
export const saveWorkEntry = (data: object, id?: number) => (id ? api.put<WorkEntry>(`/work-entries/${id}`, data) : api.post<WorkEntry>('/work-entries', data))
export const lockWorkEntry = (id: number) => api.post<WorkEntry>(`/work-entries/${id}/lock`)
export const deleteWorkEntry = (id: number) => api.delete(`/work-entries/${id}`)
export const approveWorkPeriod = (data: { from: string; to: string; workshop?: Workshop }) =>
  api.post<{ approved: number; skipped: number }>('/work-entries/approve-period', data)
export const getWorkSummary = (params: { from: string; to: string; workshop?: Workshop }) =>
  api.get<WorkSummaryRow[]>('/work-summary', { params })
