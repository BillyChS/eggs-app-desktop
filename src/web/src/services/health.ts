import { request } from './http'

export interface HealthResponse {
  status: string
  time: string
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health')
}
