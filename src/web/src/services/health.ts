export interface HealthResponse {
  status: string
  time: string
}

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health')
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return (await response.json()) as HealthResponse
}
