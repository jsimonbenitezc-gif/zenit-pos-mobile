import { useEffect, useMemo, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import CustomTabBar, { pantallasDisponibles } from './CustomTabBar';

import LoginScreen       from '../screens/auth/LoginScreen';
import RegisterScreen    from '../screens/auth/RegisterScreen';
import PerfilScreen      from '../screens/auth/PerfilScreen';
import SinConexionInicialScreen from '../screens/auth/SinConexionInicialScreen';
import DashboardScreen   from '../screens/main/DashboardScreen';
import NuevaVentaScreen  from '../screens/main/NuevaVentaScreen';
import PedidosScreen     from '../screens/main/PedidosScreen';
import MesasScreen       from '../screens/main/MesasScreen';
import ProductosScreen   from '../screens/main/ProductosScreen';
import ClientesScreen    from '../screens/main/ClientesScreen';
import TurnoScreen       from '../screens/main/TurnoScreen';
import InventarioScreen  from '../screens/main/InventarioScreen';
import OfertasScreen     from '../screens/main/OfertasScreen';
import RentabilidadScreen from '../screens/main/RentabilidadScreen';
import AjustesScreen     from '../screens/main/AjustesScreen';
import AjustesLocalScreen from '../screens/main/AjustesLocalScreen';
import KDSScreen         from '../screens/main/KDSScreen';

const SCREEN_MAP = {
  Dashboard:  DashboardScreen,
  NuevaVenta: NuevaVentaScreen,
  Pedidos:    PedidosScreen,
  Mesas:      MesasScreen,
  Productos:  ProductosScreen,
  Clientes:   ClientesScreen,
  Turno:      TurnoScreen,
  Inventario: InventarioScreen,
  Ofertas:    OfertasScreen,
  Rentabilidad: RentabilidadScreen,
  Ajustes:    AjustesScreen,
};


const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const SLOTS_KEY = 'zenit_tab_slots_v2';

function MainTabs() {
  const { isOwner, rolActivo, permisosRolesEfectivos, modoLocal } = useAuth();
  const [initialRoute, setInitialRoute] = useState(null);
  const screensRef = useRef([]);

  // El filtro vive en CustomTabBar (`pantallasDisponibles`): la barra de abajo y
  // el navegador TIENEN que ver la misma lista. Si se separaran, la barra
  // ofrecería una pestaña que aquí no está registrada y tocarla no haría nada.
  const screens = useMemo(() => {
    const lista = pantallasDisponibles({ isOwner, rolActivo, permisosRolesEfectivos, modoLocal });
    screensRef.current = lista;
    return lista;
  }, [isOwner, rolActivo, permisosRolesEfectivos, modoLocal]);

  useEffect(() => {
    SecureStore.getItemAsync(SLOTS_KEY).then(saved => {
      const available = screensRef.current.map(s => s.name);
      let first = available[0] || 'NuevaVenta';
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const found = parsed.find(name => available.includes(name));
            if (found) first = found;
          }
        } catch {}
      }
      setInitialRoute(first);
    });
  // Run once on mount — screens at mount time are what matters for initialRouteName
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!initialRoute) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false }}
      tabBar={props => <CustomTabBar {...props} />}
    >
      {screens.map(s => (
        <Tab.Screen
          key={s.name}
          name={s.name}
          // Ajustes tiene una pantalla propia sin cuenta: la normal son 1.580
          // líneas de sucursales, puestos, plan y notificaciones que en modo
          // local no existen (BLOQUE 18, trampa 4: todo es aditivo).
          component={s.name === 'Ajustes' && modoLocal ? AjustesLocalScreen : SCREEN_MAP[s.name]}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { user, loading, profileReady, rolActivo, arranqueSinCache } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {arranqueSinCache ? (
          /* Hay sesión guardada pero no se pudo reconstruir y no hay caché local.
             Mandar al login sería un callejón sin salida: el login también
             necesita internet. */
          <Stack.Screen name="SinConexion" component={SinConexionInicialScreen} />
        ) : !user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        ) : !profileReady ? (
          <Stack.Screen name="Perfil" component={PerfilScreen} />
        ) : (
          <>
            {/* key={rolActivo} fuerza re-montar MainTabs al cambiar de perfil */}
            <Stack.Screen key={rolActivo || 'dueno'} name="Main" component={MainTabs} />
            <Stack.Screen name="KDS"  component={KDSScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
