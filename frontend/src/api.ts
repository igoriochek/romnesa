import axios from 'axios'

// Bendras axios klientas. Bazinis URL iš .env (VITE_API_URL).
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api',
  headers: { Accept: 'application/json' },
})

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

export interface HealthResponse {
  status: string
  app: string
  database: string
}

export const getHealth = () => api.get<HealthResponse>('/health')
export const getRawMaterials = () => api.get<Paginated<RawMaterial>>('/raw-materials')
export const getWarehouses = () => api.get<Paginated<Warehouse>>('/warehouses')
export const getShops = () => api.get<Paginated<Shop>>('/shops')
export const getPackedProducts = () => api.get<Paginated<PackedProduct>>('/packed-products')
