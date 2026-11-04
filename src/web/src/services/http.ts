const TIMEOUT_MS = 10_000

/** The API answered with an error. Anything else that fails, like no connection, is a plain exception. */
export class ApiError extends Error {
  readonly status: number
  /** Spanish messages by field, when the API refused what was sent. */
  readonly fieldErrors: Record<string, string>
  /** A Spanish explanation to show as it is, when the API gave one. */
  readonly refusal?: string

  constructor(status: number, body: ErrorBody | null) {
    super(`HTTP ${status}`)
    this.status = status
    this.refusal = body?.message
    this.fieldErrors = Object.fromEntries(
      Object.entries(body?.errors ?? {}).map(([field, messages]) => [field, messages[0]]),
    )
  }
}

interface ErrorBody {
  message?: string
  errors?: Record<string, string[]>
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  /** Lets the caller drop a request whose answer it no longer wants. */
  signal?: AbortSignal
}

export async function request<T>(path: string, { method = 'GET', body, signal }: RequestOptions = {}): Promise<T> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS)

  const response = await fetch(path, {
    method,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    ...(body !== undefined && {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  })

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorBody(response))
  }

  return (response.status === 204 ? undefined : await response.json()) as T
}

async function readErrorBody(response: Response): Promise<ErrorBody | null> {
  try {
    return (await response.json()) as ErrorBody
  } catch {
    return null
  }
}

export function hasStatus(error: unknown, status: number): error is ApiError {
  return error instanceof ApiError && error.status === status
}
