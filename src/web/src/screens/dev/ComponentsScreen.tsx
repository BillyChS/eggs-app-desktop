import { useState } from 'react'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DateInput } from '../../components/DateInput'
import { useMessages } from '../../components/messages'
import { MoneyInput } from '../../components/MoneyInput'
import { TextInput } from '../../components/TextInput'
import { Screen } from '../../layout/Screen'
import { formatColones } from '../../lib/money'
import styles from './ComponentsScreen.module.css'

/** Development only: every base component in one place. This page isn't in the shipped build. */
export function ComponentsScreen() {
  const { showSuccess, showError } = useMessages()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState<number | null>(12500)
  const [date, setDate] = useState<string>()
  const [confirming, setConfirming] = useState(false)

  return (
    <Screen title="Componentes" backTo="/ventas">
      <div className={styles.stack}>
        <div className={styles.row}>
          <Button>Principal</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="danger">Peligro</Button>
          <Button disabled>Desactivado</Button>
        </div>

        <TextInput label="Nombre" value={name} onChange={setName} />
        <TextInput label="Con error" value="" onChange={() => {}} error="Escriba el nombre del cliente." />
        <MoneyInput label="Monto" value={amount} onChange={setAmount} />
        <p>Valor: {amount === null ? 'ninguno' : formatColones(amount)}</p>
        <DateInput label="Fecha" value={date} onChange={setDate} />

        <div className={styles.row}>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            Confirmar
          </Button>
          <Button variant="secondary" onClick={() => showSuccess('La venta se guardó.')}>
            Mensaje de éxito
          </Button>
          <Button variant="secondary" onClick={() => showError('La venta no se pudo guardar.')}>
            Mensaje de error
          </Button>
        </div>
      </div>

      {confirming && (
        <ConfirmDialog
          danger
          message="Esta venta se va a borrar."
          confirmLabel="Sí, borrar"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            showSuccess('La venta se borró.')
          }}
        />
      )}
    </Screen>
  )
}
