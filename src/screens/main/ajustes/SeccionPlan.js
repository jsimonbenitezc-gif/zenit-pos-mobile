import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert, Linking } from 'react-native';
import { api } from '../../../api/client';
import { colors, spacing, font } from '../../../theme';
import { PLAN_LABEL, PLAN_COLOR, SectionTitle, SectionCard } from './shared';
import { friendlyError } from '../../../utils/errors';

export function SeccionPlan({ plan, user, refreshUser, styles }) {
  // ── Estado ────────────────────────────────────────────────────────────────
  const [loadingCheckout, setLoadingCheckout] = useState(false);
  const [loadingTrial, setLoadingTrial]       = useState(false);
  const [loadingPortal, setLoadingPortal]     = useState(false);
  const [pollingPlan, setPollingPlan]         = useState(false);
  const [recargandoPlan, setRecargandoPlan]   = useState(false);
  const pollingRef = useRef(null);

  // Limpiar polling al desmontar
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  // ── Funciones ─────────────────────────────────────────────────────────────

  function iniciarPollingPlan() {
    if (pollingRef.current) clearInterval(pollingRef.current);
    setPollingPlan(true);
    let intentos = 0;
    pollingRef.current = setInterval(async () => {
      intentos++;
      try {
        const info = await api.syncPlan();
        if (info.plan === 'premium' && info.is_premium) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
          setPollingPlan(false);
          await refreshUser();
          Alert.alert('¡Pago confirmado!', 'Tu plan Premium ya está activo.');
          return;
        }
      } catch {}
      if (intentos >= 30) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
        setPollingPlan(false);
      }
    }, 6000);
  }

  async function abrirCheckoutStripe() {
    setLoadingCheckout(true);
    try {
      const data = await api.createCheckout();
      if (data?.url) {
        await Linking.openURL(data.url);
        iniciarPollingPlan();
      }
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo iniciar el proceso de pago.');
    } finally {
      setLoadingCheckout(false);
    }
  }

  async function iniciarPrueba() {
    setLoadingTrial(true);
    try {
      await api.startTrial();
      await refreshUser();
      Alert.alert('¡Prueba activada!', 'Tienes 30 días de Premium gratis. ¡Disfrútalo!');
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo activar la prueba gratuita.');
    } finally {
      setLoadingTrial(false);
    }
  }

  async function abrirPortalStripe() {
    setLoadingPortal(true);
    try {
      const data = await api.getBillingPortal();
      if (data?.url) await Linking.openURL(data.url);
    } catch (e) {
      Alert.alert('Error', friendlyError(e) || 'No se pudo abrir el portal de facturación.');
    } finally {
      setLoadingPortal(false);
    }
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <>
      <SectionTitle label="Mi Plan" />
      <SectionCard>
        <View style={[styles.menuItem, styles.menuItemBorder]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.menuLabel}>Plan actual</Text>
            <Text style={styles.menuSub}>
              {plan === 'premium'
                ? `Premium${user?.plan_expires_at ? ' · expira ' + new Date(user.plan_expires_at).toLocaleDateString('es-MX') : ''}`
                : plan === 'trial'
                  ? `Prueba gratuita${user?.plan_expires_at ? ' · expira ' + new Date(user.plan_expires_at).toLocaleDateString('es-MX') : ''}`
                  : 'Gratuito — funciones básicas'
              }
            </Text>
          </View>
          <View style={[styles.planBadge, { backgroundColor: PLAN_COLOR[plan] + '22', borderColor: PLAN_COLOR[plan] }]}>
            <Text style={[styles.planBadgeText, { color: PLAN_COLOR[plan] }]}>
              {PLAN_LABEL[plan] || plan}
            </Text>
          </View>
        </View>
        {/* Polling indicator */}
        {pollingPlan && (
          <View style={[styles.menuItem, { gap: spacing.sm }]}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.menuSub}>Esperando confirmación de pago...</Text>
          </View>
        )}

        {/* Botones según plan */}
        <View style={[styles.menuItem, { flexDirection: 'column', alignItems: 'stretch', gap: spacing.sm }]}>
          {/* Plan gratuito: trial + upgrade */}
          {plan === 'free' && (
            <>
              <Text style={[styles.menuSub, { marginBottom: spacing.xs }]}>
                Premium incluye: Inventario · Ofertas · Sucursales · Puntos de fidelidad · KDS
              </Text>
              <TouchableOpacity
                style={[styles.btnPlan, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, loadingTrial && { opacity: 0.6 }]}
                onPress={iniciarPrueba}
                disabled={loadingTrial}
              >
                {loadingTrial
                  ? <ActivityIndicator size="small" color={colors.primary} />
                  : <Text style={[styles.btnPlanText, { color: colors.primary }]}>Iniciar prueba gratuita (30 días)</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btnPlan, { backgroundColor: '#f59e0b' }, loadingCheckout && { opacity: 0.6 }]}
                onPress={abrirCheckoutStripe}
                disabled={loadingCheckout || pollingPlan}
              >
                {loadingCheckout
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={[styles.btnPlanText, { color: '#fff' }]}>Actualizar a Premium →</Text>
                }
              </TouchableOpacity>
            </>
          )}

          {/* En prueba: solo upgrade */}
          {plan === 'trial' && (
            <TouchableOpacity
              style={[styles.btnPlan, { backgroundColor: '#f59e0b' }, loadingCheckout && { opacity: 0.6 }]}
              onPress={abrirCheckoutStripe}
              disabled={loadingCheckout || pollingPlan}
            >
              {loadingCheckout
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={[styles.btnPlanText, { color: '#fff' }]}>Actualizar a Premium →</Text>
              }
            </TouchableOpacity>
          )}

          {/* Premium activo: gestionar suscripción */}
          {plan === 'premium' && (
            <TouchableOpacity
              style={[styles.btnPlan, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }, loadingPortal && { opacity: 0.6 }]}
              onPress={abrirPortalStripe}
              disabled={loadingPortal}
            >
              {loadingPortal
                ? <ActivityIndicator size="small" color={colors.textSecondary} />
                : <Text style={[styles.btnPlanText, { color: colors.textSecondary }]}>Gestionar suscripción →</Text>
              }
            </TouchableOpacity>
          )}

          {/* Recargar estado (siempre visible) */}
          <TouchableOpacity
            style={[styles.btnRecargar, { alignSelf: 'center' }, (recargandoPlan || pollingPlan) && { opacity: 0.6 }]}
            disabled={recargandoPlan || pollingPlan}
            onPress={async () => {
              setRecargandoPlan(true);
              await refreshUser();
              setRecargandoPlan(false);
            }}
          >
            <Text style={styles.btnRecargarText}>
              {recargandoPlan ? 'Verificando...' : '↻ Recargar estado del plan'}
            </Text>
          </TouchableOpacity>
        </View>
      </SectionCard>
    </>
  );
}
