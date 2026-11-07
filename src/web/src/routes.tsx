import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { CustomersScreen } from './screens/customers/CustomersScreen'
import { CustomerStatementScreen } from './screens/customers/CustomerStatementScreen'
import { EditCustomerScreen } from './screens/customers/EditCustomerScreen'
import { NewCustomerScreen } from './screens/customers/NewCustomerScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { EditExpenseScreen } from './screens/expenses/EditExpenseScreen'
import { ExpensesScreen } from './screens/expenses/ExpensesScreen'
import { NewExpenseScreen } from './screens/expenses/NewExpenseScreen'
import { HomeScreen } from './screens/HomeScreen'
import { EditPaymentScreen } from './screens/payments/EditPaymentScreen'
import { NewPaymentScreen } from './screens/payments/NewPaymentScreen'
import { EditSaleScreen } from './screens/sales/EditSaleScreen'
import { NewSaleScreen } from './screens/sales/NewSaleScreen'
import { SalesScreen } from './screens/sales/SalesScreen'
import { SummariesScreen } from './screens/summaries/SummariesScreen'

// Loaded on demand, so the build leaves this page out entirely.
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: 'dev/componentes',
        lazy: async () => ({ Component: (await import('./screens/dev/ComponentsScreen')).ComponentsScreen }),
      },
    ]
  : []

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    errorElement: <ErrorScreen />,
    children: [
      { index: true, element: <HomeScreen /> },
      { path: 'ventas', element: <SalesScreen /> },
      { path: 'ventas/nueva', element: <NewSaleScreen /> },
      { path: 'ventas/:id/editar', element: <EditSaleScreen /> },
      { path: 'clientes', element: <CustomersScreen /> },
      { path: 'clientes/nuevo', element: <NewCustomerScreen /> },
      { path: 'clientes/:id', element: <CustomerStatementScreen /> },
      { path: 'clientes/:id/editar', element: <EditCustomerScreen /> },
      { path: 'clientes/:id/abonos/nuevo', element: <NewPaymentScreen /> },
      { path: 'clientes/:id/abonos/:paymentId/editar', element: <EditPaymentScreen /> },
      { path: 'gastos', element: <ExpensesScreen /> },
      { path: 'gastos/nuevo', element: <NewExpenseScreen /> },
      { path: 'gastos/:id/editar', element: <EditExpenseScreen /> },
      { path: 'resumenes', element: <SummariesScreen /> },
      ...devRoutes,
      // The API serves index.html for any address, so an unknown one lands here.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
