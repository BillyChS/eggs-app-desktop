import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './layout/AppLayout'
import { ComingSoonScreen } from './screens/ComingSoonScreen'
import { ErrorScreen } from './screens/ErrorScreen'
import { HomeScreen } from './screens/HomeScreen'
import { MODULES } from './screens/modules'

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
      ...MODULES.map(({ path, label }) => ({ path, element: <ComingSoonScreen title={label} /> })),
      ...devRoutes,
      // The API serves index.html for any address, so an unknown one lands here.
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]
