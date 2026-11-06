import { Check, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/Button'
import { TextInput } from '../../components/TextInput'
import { formatColones } from '../../lib/money'
import { Screen } from '../../layout/Screen'
import { describeBalance, statementOf } from './customerText'
import styles from './CustomersScreen.module.css'
import { useCustomerList } from './useCustomerList'

export function CustomersScreen() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [onlyOwing, setOnlyOwing] = useState(false)
  const search = text.trim()
  const { result, failed, retry } = useCustomerList(search)
  const newCustomer = () => navigate('/clientes/nuevo')

  const shown = result && (onlyOwing ? result.customers.filter((customer) => customer.balance > 0) : result.customers)

  return (
    <Screen title="Clientes" backTo="/">
      <div className={styles.toolbar}>
        <div className={styles.controls}>
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
        <div className={styles.owing}>
          <Button
            variant={onlyOwing ? 'primary' : 'secondary'}
            aria-pressed={onlyOwing}
            onClick={() => setOnlyOwing((current) => !current)}
          >
            <span className={styles.buttonContent}>
              {onlyOwing && <Check size={28} aria-hidden="true" />}
              Solo los que deben
            </span>
          </Button>
          {result && result.owedTotal > 0 && (
            <p className={styles.owedTotal}>
              Por cobrar en total: <strong>{formatColones(result.owedTotal)}</strong>
            </p>
          )}
        </div>
      </div>

      {failed ? (
        <div className={styles.message}>
          <p role="alert">No se pudo cargar la lista de clientes.</p>
          <Button onClick={retry}>Intentar de nuevo</Button>
        </div>
      ) : !result || !shown ? (
        <p role="status" className={styles.message}>
          Cargando…
        </p>
      ) : shown.length > 0 ? (
        <ul className={styles.list} aria-label="Clientes">
          {shown.map((customer) => (
            <li key={customer.id}>
              <button type="button" className={styles.row} onClick={() => navigate(statementOf(customer.id))}>
                <span className={styles.rowText}>
                  <span className={styles.name}>{customer.name}</span>
                  <span className={styles.phone}>{customer.phone ?? 'Sin teléfono'}</span>
                </span>
                <span className={styles.rowEnd}>
                  <span className={customer.balance > 0 ? styles.owes : styles.upToDate}>
                    {describeBalance(customer.balance)}
                  </span>
                  <ChevronRight size={36} aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : onlyOwing && result.customers.length > 0 ? (
        <div className={styles.message}>
          <p role="status">
            {result.search ? `Nadie con “${result.search}” debe nada.` : 'Nadie debe nada. Todos están al día.'}
          </p>
          <Button variant="secondary" onClick={() => setOnlyOwing(false)}>
            Ver todos
          </Button>
        </div>
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
