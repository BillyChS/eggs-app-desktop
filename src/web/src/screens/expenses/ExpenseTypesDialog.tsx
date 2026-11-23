import { CircleHelp, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Modal } from '../../components/Modal'
import { TextInput } from '../../components/TextInput'
import { LoadProblem } from '../../layout/LoadProblem'
import { useLoad } from '../../layout/useLoad'
import { useOneAtATime } from '../../layout/useOneAtATime'
import {
  createExpenseCategory,
  listExpenseCategories,
  retireExpenseCategory,
  type ExpenseType,
} from '../../services/expenses'
import { ApiError, hasStatus } from '../../services/http'
import {
  byTypeOrder,
  cleanTypeName,
  plural,
  sameType,
  TYPE_NAME_MAX_LENGTH,
  typeNameProblem,
} from './expenseText'
// The row buttons of Ventas and Gastos.
import sales from '../sales/SalesScreen.module.css'
import styles from './ExpenseTypesDialog.module.css'

// Must match CategoryNames.cs.
const NAME_MISSING = 'Escriba el nombre del tipo.'
const ADD_FAILED = 'No se pudo agregar el tipo. Intente de nuevo.'
const RETIRE_FAILED = 'No se pudo eliminar el tipo. Intente de nuevo.'

interface Props {
  onClose: () => void
}

/**
 * "Tipos de gasto": the types new expenses can use, each with how many expenses use it, a field to add one, and
 * Eliminar, which asks first, in place of the list. Eliminar retires it: its expenses keep showing it. "Otro" stays.
 */
export function ExpenseTypesDialog({ onClose }: Props) {
  const { run: oneAtATime } = useOneAtATime()
  const { load, retry } = useLoad('expense-types', listExpenseCategories, 'No se encontraron los tipos de gasto.')
  // What changed here since the list loaded, so it never has to load again and lose its place.
  const [changed, setChanged] = useState<ExpenseType[] | null>(null)
  const types = changed ?? (load.state === 'ready' ? load.value : null)

  const [name, setName] = useState('')
  const [nameError, setNameError] = useState<string>()
  // What the last add or delete did, or why it couldn't.
  const [result, setResult] = useState<{ text: string; failed: boolean } | null>(null)
  const [retiring, setRetiring] = useState<ExpenseType | null>(null)

  const closeRef = useRef<HTMLButtonElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const keepRef = useRef<HTMLButtonElement>(null)

  const focusNext = useRef<(() => HTMLElement | null) | null>(null)
  useEffect(() => {
    const target = focusNext.current?.()
    if (target) {
      target.focus()
      focusNext.current = null
    }
  })

  const add = async () => {
    const clean = cleanTypeName(name)
    const problem = typeNameProblem(clean, NAME_MISSING)
    const existing = problem ? undefined : sameType(types ?? [], clean)

    if (problem || existing) {
      setNameError(problem ?? `Ya existe el tipo ${existing!.name}.`)
      nameRef.current?.focus()
      return
    }

    try {
      const added = await createExpenseCategory(clean)
      setChanged([...(types ?? []).filter((type) => type.id !== added.id), added].sort(byTypeOrder))
      setName('')
      setResult({ text: `Se agregó el tipo ${added.name}.`, failed: false })
      nameRef.current?.focus()
    } catch (error) {
      if (hasStatus(error, 400) && error.fieldErrors.name) {
        setNameError(error.fieldErrors.name)
        nameRef.current?.focus()
      } else {
        setResult({ text: ADD_FAILED, failed: true })
      }
    }
  }

  const retire = async (type: ExpenseType) => {
    const without = (types ?? []).filter((candidate) => candidate.id !== type.id)

    try {
      await retireExpenseCategory(type.id)
      setChanged(without)
      setResult({ text: `Se eliminó el tipo ${type.name}.`, failed: false })
    } catch (error) {
      if (hasStatus(error, 404)) {
        setChanged(without)
        setResult({ text: `El tipo ${type.name} ya no estaba.`, failed: false })
      } else {
        const refusal = error instanceof ApiError ? error.refusal : null
        setResult({ text: refusal ?? RETIRE_FAILED, failed: true })
      }
    }

    setRetiring(null)
    focusNext.current = () => closeRef.current
  }

  const backToList = () => {
    setRetiring(null)
    focusNext.current = () => closeRef.current
  }

  // Both views are this one Modal, which stays open between them; initialFocus is only read when it opens.
  if (retiring) {
    return (
      <Modal
        title="¿Eliminar este tipo?"
        message={`¿Eliminar el tipo ${retiring.name}? Los gastos que ya lo usan lo mantienen.`}
        tone="danger"
        icon={<CircleHelp size={44} />}
        className={styles.dialog}
        onEscape={backToList}
        initialFocus={closeRef}
      >
        <Button ref={keepRef} variant="secondary" onClick={backToList}>
          No, cancelar
        </Button>
        <Button variant="danger" onClick={() => void oneAtATime(() => retire(retiring))}>
          Sí, eliminar
        </Button>
      </Modal>
    )
  }

  return (
    <Modal
      title="Tipos de gasto"
      className={styles.dialog}
      onEscape={onClose}
      initialFocus={closeRef}
      body={
        !types ? (
          <LoadProblem
            state={load.state === 'failed' ? 'failed' : 'loading'}
            failedMessage="No se pudieron cargar los tipos de gasto."
            onRetry={retry}
          />
        ) : (
          <>
            <ul className={styles.list} aria-label="Tipos de gasto">
              {types.map((type) => (
                <li key={type.id} className={styles.row}>
                  <span className={styles.name}>{type.name}</span>
                  <span className={styles.count}>{plural(type.expenseCount, 'gasto', 'gastos')}</span>
                  {type.needsDescription ? (
                    // "Otro" can't go: it's how a type that isn't in the list yet is added from the form.
                    <span className={styles.fixed}>Siempre está</span>
                  ) : (
                    <button
                      type="button"
                      className={sales.remove}
                      aria-label={`Eliminar el tipo ${type.name}`}
                      onClick={() => {
                        setResult(null)
                        setRetiring(type)
                        focusNext.current = () => keepRef.current
                      }}
                    >
                      <Trash2 size={20} aria-hidden="true" />
                      Eliminar
                    </button>
                  )}
                </li>
              ))}
            </ul>

            <div className={styles.add}>
              <TextInput
                ref={nameRef}
                label="Agregar tipo"
                value={name}
                onChange={(next) => {
                  setName(next)
                  setNameError(undefined)
                }}
                error={nameError}
                maxLength={TYPE_NAME_MAX_LENGTH}
                inputProps={{
                  placeholder: 'Por ejemplo: Gasolina',
                  // Enter moves on to Agregar, and never adds by itself.
                  onKeyDown: (event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      addRef.current?.focus()
                    }
                  },
                }}
              />
              <Button ref={addRef} className={styles.addButton} onClick={() => void oneAtATime(add)}>
                Agregar
              </Button>
            </div>

            {result && (
              <p role={result.failed ? 'alert' : 'status'} className={result.failed ? styles.failed : styles.done}>
                {result.text}
              </p>
            )}
          </>
        )
      }
    >
      <Button ref={closeRef} variant="secondary" onClick={onClose}>
        Cerrar
      </Button>
    </Modal>
  )
}
