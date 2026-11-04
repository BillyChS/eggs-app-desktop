import { ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { Screen } from '../../layout/Screen'
import styles from './CustomersScreen.module.css'
import { useCustomerList } from './useCustomerList'

export function CustomersScreen() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const search = text.trim()
  const { result, failed, retry } = useCustomerList(search)
  const newCustomer = () => navigate('/clientes/nuevo')

  return (
    <Screen title="Clientes" backTo="/">
      <div className={styles.toolbar}>
        <div className={styles.search}>
          <TextInput label="Buscar por nombre" value={text} onChange={setText} />
        </div>
        <Button onClick={newCustomer}>
          <span className={styles.buttonContent}>
            <Plus size={28} aria-hidden="true" />
            Nuevo cliente
          </span>
        </Button>
      </div>

      {failed ? (
        <div className={styles.message}>
          <p role="alert">No se pudo cargar la lista de clientes.</p>
          <Button onClick={retry}>Intentar de nuevo</Button>
        </div>
      ) : !result ? (
        <p role="status" className={styles.message}>
          Cargando…
        </p>
      ) : result.customers.length > 0 ? (
        <ul className={styles.list} aria-label="Clientes">
          {result.customers.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                className={styles.row}
                onClick={() => navigate(`/clientes/${customer.id}/editar`)}
              >
                <span className={styles.rowText}>
                  <span className={styles.name}>{customer.name}</span>
                  <span className={styles.phone}>{customer.phone ?? 'Sin teléfono'}</span>
                </span>
                <ChevronRight size={36} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : result.search ? (
        <div className={styles.message}>
          <p role="status">No se encontró ningún cliente con “{result.search}”.</p>
          <Button variant="secondary" onClick={() => setText('')}>
            Borrar búsqueda
          </Button>
        </div>
      ) : (
        <div className={styles.message}>
          <p role="status">Todavía no hay clientes.</p>
        </div>
      )}
    </Screen>
  )
}
