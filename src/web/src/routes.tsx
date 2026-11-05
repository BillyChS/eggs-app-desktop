import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { ComingSoonScreen } from './screens/ComingSoonScreen'
import { CustomersScreen } from './screens/customers/CustomersScreen'
import { EditCustomerScreen } from './screens/customers/EditCustomerScreen'
import { NewCustomerScreen } from './screens/customers/NewCustomerScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { HomeScreen } from './screens/HomeScreen'
import { EditSaleScreen } from './screens/sales/EditSaleScreen'
import { NewSaleScreen } from './screens/sales/NewSaleScreen'
import { SalesScreen } from './screens/sales/SalesScreen'

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
      { path: 'clientes/:id/editar', element: <EditCustomerScreen /> },
      { path: 'gastos', element: <ComingSoonScreen title="Gastos" /> },
      { path: 'resumenes', element: <ComingSoonScreen title="Resúmenes" /> },
      ...devRoutes,
      // The API serves index.html for any address, so an unknown one lands here.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
