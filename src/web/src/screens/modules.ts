import { ChartColumn, ReceiptText, ShoppingBasket, Users, type LucideIcon } from 'lucide-react'

export interface AppModule {
  path: string
  label: string
  icon: LucideIcon
}

export const MODULES: AppModule[] = [
  { path: '/ventas', label: 'Ventas', icon: ShoppingBasket },
  { path: '/clientes', label: 'Clientes', icon: Users },
  { path: '/gastos', label: 'Gastos', icon: ReceiptText },
  { path: '/resumenes', label: 'Resúmenes', icon: ChartColumn },
]
