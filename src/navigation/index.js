import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, View } from 'react-native';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

// Pantallas de auth
import LoginScreen from '../screens/auth/LoginScreen';

// Pantallas principales
import DashboardScreen   from '../screens/main/DashboardScreen';
import NuevaVentaScreen  from '../screens/main/NuevaVentaScreen';
import PedidosScreen     from '../screens/main/PedidosScreen';
import ProductosScreen   from '../screens/main/ProductosScreen';
import ClientesScreen    from '../screens/main/ClientesScreen';
import AjustesScreen     from '../screens/main/AjustesScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

function TabIcon({ name, color, size }) {
  return <Ionicons name={name} size={size} color={color} />;
}

function MainTabs() {
  const { isOwner } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { borderTopColor: colors.border, paddingBottom: 4, height: 60 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      {isOwner && (
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={{ tabBarLabel: 'Resumen', tabBarIcon: (p) => <TabIcon name="bar-chart-outline" {...p} /> }}
        />
      )}
      <Tab.Screen
        name="NuevaVenta"
        component={NuevaVentaScreen}
        options={{ tabBarLabel: 'Venta', tabBarIcon: (p) => <TabIcon name="cart-outline" {...p} /> }}
      />
      <Tab.Screen
        name="Pedidos"
        component={PedidosScreen}
        options={{ tabBarLabel: 'Pedidos', tabBarIcon: (p) => <TabIcon name="receipt-outline" {...p} /> }}
      />
      <Tab.Screen
        name="Productos"
        component={ProductosScreen}
        options={{ tabBarLabel: 'Productos', tabBarIcon: (p) => <TabIcon name="cube-outline" {...p} /> }}
      />
      <Tab.Screen
        name="Clientes"
        component={ClientesScreen}
        options={{ tabBarLabel: 'Clientes', tabBarIcon: (p) => <TabIcon name="people-outline" {...p} /> }}
      />
      <Tab.Screen
        name="Ajustes"
        component={AjustesScreen}
        options={{ tabBarLabel: 'Ajustes', tabBarIcon: (p) => <TabIcon name="settings-outline" {...p} /> }}
      />
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
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
