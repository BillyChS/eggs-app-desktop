import { useEffect, useState } from 'react'
import { getHealth, type HealthResponse } from './services/health'

type HealthState =
  | { kind: 'loading' }
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'error'; message: string }

function App() {
  const [health, setHealth] = useState<HealthState>({ kind: 'loading' })

  useEffect(() => {
    getHealth()
      .then((data) => setHealth({ kind: 'ok', data }))
      .catch((error: unknown) =>
        setHealth({ kind: 'error', message: error instanceof Error ? error.message : String(error) }),
      )
  }, [])

  return (
    <main>
      <h1>Eggs App</h1>
      <h2>Estado del servidor</h2>
      {health.kind === 'loading' && <p>Cargando…</p>}
      {health.kind === 'ok' && (
        <p className="ok">
          Conectado ({health.data.status}) · {new Date(health.data.time).toLocaleString('es-CR')}
        </p>
      )}
      {health.kind === 'error' && <p className="error">No se pudo conectar: {health.message}</p>}
    </main>
  )
}

export default App
