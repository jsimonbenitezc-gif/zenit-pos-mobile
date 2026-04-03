import { useEffect, useMemo, useRef, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import CustomTabBar, { ALL_SCREENS } from './CustomTabBar';
import { SCREEN_PERM_MAP } from './screenPerms';

import LoginScreen       from '../screens/auth/LoginScreen';
import PerfilScreen      from '../screens/auth/PerfilScreen';
import DashboardScreen   from '../screens/main/DashboardScreen';
import NuevaVentaScreen  from '../screens/main/NuevaVentaScreen';
import PedidosScreen     from '../screens/main/PedidosScreen';
import MesasScreen       from '../screens/main/MesasScreen';
import ProductosScreen   from '../screens/main/ProductosScreen';
import ClientesScreen    from '../screens/main/ClientesScreen';
import TurnoScreen       from '../screens/main/TurnoScreen';
import InventarioScreen  from '../screens/main/InventarioScreen';
import OfertasScreen     from '../screens/main/OfertasScreen';
import AjustesScreen     from '../screens/main/AjustesScreen';
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
  Ajustes:    AjustesScreen,
};


const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

const SLOTS_KEY = 'zenit_tab_slots_v2';

function MainTabs() {
  const { isOwner, rolActivo, permisosRolesEfectivos } = useAuth();
  const [initialRoute, setInitialRoute] = useState(null);
  const screensRef = useRef([]);

  const screens = useMemo(() => {
    // Primer filtro: ownerOnly
    let lista = ALL_SCREENS.filter(s => !s.ownerOnly || isOwner);
    // Segundo filtro: permisos del puesto activo (solo si no es admin)
    if (rolActivo && rolActivo !== 'dueno') {
      const permisos = permisosRolesEfectivos?.[rolActivo] || {};
      lista = lista.filter(s => {
        if (s.name === 'Ajustes') return true; // siempre visible para impresora/KDS/cambiar perfil
        const key = SCREEN_PERM_MAP[s.name];
        if (!key) return true;
        return permisos[key] !== false;
      });
    }
    screensRef.current = lista;
    return lista;
  }, [isOwner, rolActivo, permisosRolesEfectivos]);

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
          component={SCREEN_MAP[s.name]}
        />
      ))}
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { user, loading, profileReady, rolActivo } = useAuth();

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
        {!user ? (
          <Stack.Screen name="Login" component={LoginScreen} />
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
