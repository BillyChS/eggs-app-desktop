export interface HealthResponse {
  status: string
  time: string
}

const TIMEOUT_MS = 10_000

export async function getHealth(): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return (await response.json()) as HealthResponse
}
