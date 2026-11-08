import { NO_NAME } from './saleText'

export interface PickedCustomer {
  id: string
  name: string
  isDeleted?: boolean
}

/**
 * Who the sale is for. Something is always chosen once the payment is: "Cliente sin nombre" is a sale with no customer,
 * which only a cash sale can be.
 */
export type CustomerChoice =
  | { kind: 'none' }
  | { kind: 'noName' }
  | { kind: 'existing'; customer: PickedCustomer }
  | { kind: 'new'; name: string; phone: string }

/** "Elegido: …" */
export function describeChoice(choice: CustomerChoice): string {
  switch (choice.kind) {
    case 'none':
      return 'ninguno'
    case 'noName':
      return NO_NAME
    case 'existing':
      return choice.customer.isDeleted ? `${choice.customer.name} (borrado)` : choice.customer.name
    case 'new':
      return choice.name.trim() || 'Cliente nuevo'
  }
}

export const NO_NAME_FOR_CREDIT = 'Para fiar hay que elegir un cliente con nombre.'

/** A new customer's name as it's saved: no spaces around it, and one between words. */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ')
