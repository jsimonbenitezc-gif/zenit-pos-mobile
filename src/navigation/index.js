import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';
import CustomTabBar, { ALL_SCREENS } from './CustomTabBar';

import LoginScreen       from '../screens/auth/LoginScreen';
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

function MainTabs() {
  const { isOwner } = useAuth();
  const screens = ALL_SCREENS.filter(s => !s.ownerOnly || isOwner);

  return (
    <Tab.Navigator
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
  const { user, loading } = useAuth();

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
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen name="KDS"  component={KDSScreen} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
