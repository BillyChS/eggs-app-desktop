import { request } from './http'

export interface HealthResponse {
  status: string
  time: string
  /** The app's version, like "1.0.0". */
  version: string
}

export function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/api/health')
}
