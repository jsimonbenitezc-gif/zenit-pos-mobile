const BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://zenit-pos-backend.onrender.com/api';
const REQUEST_TIMEOUT_MS = 30000; // 30 segundos

class ApiClient {
  constructor() {
    this.token = null;
    this.refreshToken = null;
    this.baseURL = BASE_URL;
    this._pinFailCount = 0;
    this._pinLockedUntil = null;
    this.onUnauthorized = null; // callback para sesión expirada
    this.onTokenRefreshed = null; // callback (token, refreshToken) tras rotación exitosa
    this._refreshPromise = null; // dedupe: evita refrescar varias veces en paralelo
    this._refreshRejected = false; // true solo si el servidor rechazó el refresh token (401/403)
  }

  // ─── Control de intentos de PIN ──────────────────────────────────────
  isPinLocked() {
    if (!this._pinLockedUntil) return false;
    if (Date.now() >= this._pinLockedUntil) {
      this._pinFailCount = 0;
      this._pinLockedUntil = null;
      return false;
    }
    return true;
  }

  getPinLockRemainingMin() {
    if (!this._pinLockedUntil) return 0;
    return Math.max(0, Math.ceil((this._pinLockedUntil - Date.now()) / 60000));
  }

  registerPinFailure() {
    this._pinFailCount++;
    if (this._pinFailCount >= 5) {
      this._pinLockedUntil = Date.now() + 5 * 60 * 1000;
    }
  }

  resetPinAttempts() {
    this._pinFailCount = 0;
    this._pinLockedUntil = null;
  }

  setToken(token) {
    this.token = token;
  }

  clearToken() {
    this.token = null;
  }

  setRefreshToken(refreshToken) {
    this.refreshToken = refreshToken;
  }

  clearRefreshToken() {
    this.refreshToken = null;
  }

  // Despierta el servidor de Render.com en background (cold start ~30s).
  // Se llama al arrancar la app sin bloquear nada.
  ping() {
    const base = BASE_URL.replace(/\/api$/, '');
    fetch(`${base}/health`).catch(() => {});
  }

  // Intenta rotar el access token usando el refresh token actual.
  // Devuelve el nuevo access token o null si falló.
  // Usa fetch directamente (no this.request) para evitar recursión infinita.
  async _doRefresh() {
    if (!this.refreshToken) return null;
    this._refreshRejected = false;
    const url = `${BASE_URL}/auth/refresh`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        // Solo un 401/403 significa que el refresh token ya no sirve (sesión realmente
        // expirada). Un 500 u otro error es del servidor → transitorio, no invalidar.
        this._refreshRejected = (response.status === 401 || response.status === 403);
        return null;
      }
      const data = await response.json();
      if (!data || !data.token) return null;
      this.token = data.token;
      if (data.refreshToken) this.refreshToken = data.refreshToken;
      if (this.onTokenRefreshed) {
        try { await this.onTokenRefreshed(data.token, data.refreshToken || null); } catch {}
      }
      return data.token;
    } catch {
      // Error de red / timeout (p. ej. cold start de Render): NO sabemos si el token
      // sigue válido → no invalidar la sesión, solo fallar el request de forma transitoria.
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Garantiza una sola operación de refresh concurrente.
  _refreshTokenOnce() {
    if (!this._refreshPromise) {
      this._refreshPromise = this._doRefresh().finally(() => {
        this._refreshPromise = null;
      });
    }
    return this._refreshPromise;
  }

  // Decodifica la fecha de expiración (exp) del JWT actual, en milisegundos.
  // Sin atob(): Hermes no garantiza soportarlo (ver CLAUDE.md — trampas Hermes).
  _tokenExpMs() {
    try {
      const payload = this.token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let out = '', buffer = 0, bits = 0;
      for (const c of payload.replace(/=+$/, '')) {
        const val = chars.indexOf(c);
        if (val < 0) continue;
        buffer = (buffer << 6) | val; bits += 6;
        if (bits >= 8) { bits -= 8; out += String.fromCharCode((buffer >> bits) & 0xff); }
      }
      return (JSON.parse(out).exp || 0) * 1000;
    } catch { return 0; }
  }

  // Renueva el access token si está vencido o por vencer (< 60s).
  // Lo usan las conexiones SSE antes de (re)conectar: sin esto, una reconexión
  // con token vencido falla en cadena y las pantallas quedan esperando al polling.
  async ensureFreshToken() {
    if (!this.token || !this.refreshToken) return;
    const exp = this._tokenExpMs();
    if (exp && exp - Date.now() < 60000) {
      await this._refreshTokenOnce();
    }
  }

  async request(endpoint, options = {}, _isRetry = false) {
    const url = `${BASE_URL}${endpoint}`;
    const headers = { 'Content-Type': 'application/json' };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const config = { ...options, headers, cache: 'no-store', signal: controller.signal };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);

      if (response.status === 401) {
        // Endpoints de autenticación: un 401 significa CREDENCIALES INCORRECTAS, no
        // sesión expirada. No hay que rotar token ni borrar la sesión — se deja caer al
        // manejo genérico de abajo, que devuelve el mensaje del backend ("Credenciales
        // incorrectas"). Sin esto, un login fallido mostraba "Sesión expirada".
        const esEndpointAuth = endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/register') || endpoint.startsWith('/staff/login');
        if (!esEndpointAuth) {
          // Si tenemos refresh token y no es ya un reintento, intentar rotar y reintentar
          if (!_isRetry && this.refreshToken) {
            const nuevoToken = await this._refreshTokenOnce();
            if (nuevoToken) {
              return this.request(endpoint, options, true);
            }
            // El refresh falló. Solo cerrar sesión si el servidor rechazó el refresh token
            // explícitamente (401/403). Si fue un fallo de red / cold start de Render, NO
            // borrar la sesión: se falla el request de forma transitoria y se reintenta luego.
            if (!this._refreshRejected) {
              throw new Error('Sin conexión al servidor');
            }
          }
          this.token = null;
          this.refreshToken = null;
          if (this.onUnauthorized) this.onUnauthorized();
          throw new Error('Sesión expirada');
        }
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Error ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('El servidor tardó mucho en responder');
      }
      if (error instanceof TypeError && error.message.includes('Network request failed')) {
        throw new Error('Sin conexión al servidor');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // Recorre todas las páginas de un endpoint paginado y devuelve un array plano.
  // Los endpoints /products, /customers e /inventory/ingredients responden
  // { data, pagination } (no un array). Las pantallas esperan un array y hacen
  // .filter directamente, así que desenvolvemos aquí en un solo punto.
  async _getAllPaginated(endpoint) {
    const sep = endpoint.includes('?') ? '&' : '?';
    let page = 1;
    const acumulado = [];
    // Tope de seguridad para no ciclar indefinidamente
    for (let i = 0; i < 100; i++) {
      const resp = await this.request(`${endpoint}${sep}page=${page}&limit=100`);
      if (Array.isArray(resp)) return resp; // endpoint no paginado
      const filas = Array.isArray(resp?.data) ? resp.data : [];
      acumulado.push(...filas);
      const totalPages = resp?.pagination?.totalPages || 1;
      if (page >= totalPages || filas.length === 0) break;
      page++;
    }
    return acumulado;
  }

  // ─── Auth ────────────────────────────────────────────────────────────────
  login(username, password) {
    return this.request('/auth/login', { method: 'POST', body: { username, password } });
  }

  // `tz`: zona horaria IANA del dispositivo. El backend la guarda en settings.tz y la
  // usa para cortar el día en stats y en los resúmenes automáticos.
  register(name, email, password, tz) {
    return this.request('/auth/register', { method: 'POST', body: { name, email, password, ...(tz ? { tz } : {}) } });
  }

  staffLogin(username, password) {
    return this.request('/staff/login', { method: 'POST', body: { username, password } });
  }

  getMe() {
    return this.request('/auth/me');
  }

  // Reenviar el correo de confirmación de cuenta (política suave)
  resendVerification() {
    return this.request('/auth/resend-verification', { method: 'POST' });
  }

  // Solicitar correo de recuperación de contraseña (respuesta genérica anti-enumeración)
  forgotPassword(email) {
    return this.request('/auth/forgot-password', { method: 'POST', body: { email } });
  }

  // ─── Productos ───────────────────────────────────────────────────────────
  getProducts() {
    return this._getAllPaginated('/products');
  }

  getProductsGrouped() {
    return this.request('/products/grouped');
  }

  createProduct(data) {
    return this.request('/products', { method: 'POST', body: data });
  }

  updateProduct(id, data) {
    return this.request(`/products/${id}`, { method: 'PUT', body: data });
  }

  deleteProduct(id) {
    return this.request(`/products/${id}`, { method: 'DELETE' });
  }

  // ─── Categorías ──────────────────────────────────────────────────────────
  getCategories() {
    return this.request('/categories');
  }

  createCategory(data) {
    return this.request('/categories', { method: 'POST', body: data });
  }

  updateCategory(id, data) {
    return this.request(`/categories/${id}`, { method: 'PUT', body: data });
  }

  deleteCategory(id) {
    return this.request(`/categories/${id}`, { method: 'DELETE' });
  }

  // ─── Pedidos ─────────────────────────────────────────────────────────────
  getOrders(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/orders${query ? '?' + query : ''}`);
  }

  createOrder(data) {
    return this.request('/orders', { method: 'POST', body: data });
  }

  // `extra` lleva lo que se decide AL COBRAR una mesa: el método de pago y la
  // propina (BLOQUE 9). ⚠️ El método de pago no se mandaba: la app dejaba elegir
  // "tarjeta" y la venta se guardaba como efectivo, así que el cierre de turno le
  // exigía al cajero un efectivo que nunca entró al cajón.
  updateOrderStatus(id, status, extra = {}) {
    return this.request(`/orders/${id}/status`, { method: 'PUT', body: { status, ...extra } });
  }

  // Un pedido con TODO su detalle: items (con sus modificadores congelados),
  // desglose de impuesto y reparto de pagos. Lo usa la reimpresión del ticket,
  // porque el listado no trae los items completos de cada pedido.
  getOrder(id) {
    return this.request(`/orders/${id}`);
  }

  // Token acotado para abrir el KDS en otro dispositivo (QR). Dura 12h y el backend
  // solo lo acepta para leer la cola de cocina (`middleware/auth.js`).
  // NUNCA metas el token de sesión en el QR: da acceso completo a la cuenta.
  getKdsToken(branchId = null) {
    return this.request('/kds/token', { method: 'POST', body: { branch_id: branchId } });
  }

  // ─── Clientes ────────────────────────────────────────────────────────────
  getCustomers() {
    return this._getAllPaginated('/customers');
  }

  createCustomer(data) {
    return this.request('/customers', { method: 'POST', body: data });
  }

  updateCustomer(id, data) {
    return this.request(`/customers/${id}`, { method: 'PUT', body: data });
  }

  // ─── Estadísticas ────────────────────────────────────────────────────────
  getDashboard(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this.request(`/stats/dashboard${q}`);
  }

  // Rentabilidad por producto (BLOQUE 12). Premium: el costo sale de las
  // recetas del inventario, que ya es premium.
  getProfitability({ desde, hasta, orden, branchId } = {}) {
    const params = [];
    if (desde) params.push(`date_from=${desde}`);
    if (hasta) params.push(`date_to=${hasta}`);
    if (orden) params.push(`order_by=${orden}`);
    if (branchId) params.push(`branch_id=${branchId}`);
    const q = params.length ? `?${params.join('&')}` : '';
    return this.request(`/stats/profitability${q}`);
  }

  // ─── Inventario (premium) ────────────────────────────────────────────────
  getIngredients(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this._getAllPaginated(`/inventory/ingredients${q}`);
  }

  createMovement(data) {
    return this.request('/inventory/movements', { method: 'POST', body: data });
  }

  getPreparations() {
    return this.request('/inventory/preparations');
  }

  createIngredient(data) {
    return this.request('/inventory/ingredients', { method: 'POST', body: data });
  }

  updateIngredient(id, data) {
    return this.request(`/inventory/ingredients/${id}`, { method: 'PUT', body: data });
  }

  createPreparation(data) {
    return this.request('/inventory/preparations', { method: 'POST', body: data });
  }

  updatePreparation(id, data) {
    return this.request(`/inventory/preparations/${id}`, { method: 'PUT', body: data });
  }

  savePreparationRecipe(id, items) {
    return this.request(`/inventory/preparations/${id}/recipe`, { method: 'POST', body: { items } });
  }

  getAllRecipes() {
    return this.request('/inventory/all-recipes');
  }

  saveProductRecipe(id, items) {
    return this.request(`/inventory/products/${id}/recipe`, { method: 'POST', body: { items } });
  }

  deleteProductRecipe(id) {
    return this.request(`/inventory/products/${id}/recipe`, { method: 'DELETE' });
  }

  async getInventoryEventsConfig() {
    await this.ensureFreshToken();
    if (!this.token) return null;
    return {
      url: `${BASE_URL}/inventory/events`,
      options: { headers: { Authorization: `Bearer ${this.token}` } },
    };
  }

  async getOrdersEventsConfig() {
    await this.ensureFreshToken();
    if (!this.token) return null;
    return {
      url: `${BASE_URL}/orders/events`,
      options: { headers: { Authorization: `Bearer ${this.token}` } },
    };
  }

  getProductsStock(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this.request(`/inventory/products-stock${q}`);
  }

  async getSettingsEventsConfig() {
    await this.ensureFreshToken();
    if (!this.token) return null;
    return {
      url: `${BASE_URL}/settings/events`,
      options: { headers: { Authorization: `Bearer ${this.token}` } },
    };
  }

  getMovements(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/inventory/movements${q ? '?' + q : ''}`);
  }

  // ─── Ofertas (premium) ───────────────────────────────────────────────────
  getDiscounts() {
    return this.request('/offers/discounts');
  }

  createDiscount(data) {
    return this.request('/offers/discounts', { method: 'POST', body: data });
  }

  updateDiscount(id, data) {
    return this.request(`/offers/discounts/${id}`, { method: 'PUT', body: data });
  }

  deleteDiscount(id) {
    return this.request(`/offers/discounts/${id}`, { method: 'DELETE' });
  }

  // ─── Modificadores (BLOQUE 11) ───────────────────────────────────────────
  // La biblioteca del negocio: grupos ("Extras", "Tamaño") con sus opciones, y
  // qué producto usa cuáles. Viene entera en UNA llamada porque es lo que se
  // cachea para poder armar un carrito con extras sin internet.
  getModifiers() {
    return this.request('/modifiers');
  }

  createModifierGroup(data) {
    return this.request('/modifiers/groups', { method: 'POST', body: data });
  }

  updateModifierGroup(id, data) {
    return this.request(`/modifiers/groups/${id}`, { method: 'PUT', body: data });
  }

  deleteModifierGroup(id) {
    return this.request(`/modifiers/groups/${id}`, { method: 'DELETE' });
  }

  createModifierOption(groupId, data) {
    return this.request(`/modifiers/groups/${groupId}/options`, { method: 'POST', body: data });
  }

  updateModifierOption(id, data) {
    return this.request(`/modifiers/options/${id}`, { method: 'PUT', body: data });
  }

  deleteModifierOption(id) {
    return this.request(`/modifiers/options/${id}`, { method: 'DELETE' });
  }

  getProductModifiers(productId) {
    return this.request(`/modifiers/products/${productId}`);
  }

  setProductModifiers(productId, groupIds) {
    return this.request(`/modifiers/products/${productId}`, {
      method: 'PUT',
      body: { group_ids: groupIds },
    });
  }

  // ─── Mesas ───────────────────────────────────────────────────────────────
  // branchId opcional: las mesas viven en una sucursal (las creadas antes de esa
  // regla no tienen y se ven siempre).
  getTables(branchId) {
    return this.request(branchId ? `/tables?branch_id=${branchId}` : '/tables');
  }

  createTable(data) {
    return this.request('/tables', { method: 'POST', body: data });
  }

  deleteTable(id) {
    return this.request(`/tables/${id}`, { method: 'DELETE' });
  }

  // clientUuid identifica el ENVÍO completo: un reenvío (doble tap, red débil) no
  // vuelve a agregar los productos a la mesa ni a descontar los insumos otra vez.
  addItemsToOrder(orderId, items, clientUuid) {
    return this.request(`/orders/${orderId}/items`, {
      method: 'POST',
      body: { items, client_uuid: clientUuid || null },
    });
  }

  // ─── Ajustes ─────────────────────────────────────────────────────────────
  getSettings() {
    return this.request('/settings');
  }

  updateSettings(data) {
    return this.request('/settings', { method: 'PUT', body: data });
  }

  verifyProfilePin(role, pin) {
    return this.request('/settings/verify-pin', { method: 'POST', body: { role, pin } });
  }

  hashProfilePin(pin) {
    return this.request('/settings/hash-pin', { method: 'POST', body: { pin } });
  }

  updateCustomerLoyalty(id, data) {
    return this.request(`/customers/${id}/loyalty`, { method: 'PATCH', body: data });
  }

  // ─── Facturación ─────────────────────────────────────────────────────────
  createCheckout() {
    return this.request('/billing/create-checkout', { method: 'POST' });
  }

  startTrial() {
    return this.request('/billing/start-trial', { method: 'POST' });
  }

  syncPlan() {
    return this.request('/billing/sync');
  }

  getBillingPortal() {
    return this.request('/billing/portal', { method: 'POST' });
  }

  // ─── Contraseña ──────────────────────────────────────────────────────────
  changePassword(currentPassword, newPassword) {
    return this.request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } });
  }

  // ─── Sucursales ──────────────────────────────────────────────────────────
  getBranches() {
    return this.request('/branches');
  }

  createBranch(data) {
    return this.request('/branches', { method: 'POST', body: data });
  }

  updateBranch(id, data) {
    return this.request(`/branches/${id}`, { method: 'PUT', body: data });
  }

  deleteBranch(id) {
    return this.request(`/branches/${id}`, { method: 'DELETE' });
  }

  // ─── Turnos ──────────────────────────────────────────────────────────────
  getTurnoActivo(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this.request(`/turnos/activo${q}`);
  }

  abrirTurno(cajeroNombre, rol, fondoInicial, branchId) {
    return this.request('/turnos', {
      method: 'POST',
      body: { cajero_nombre: cajeroNombre, rol, fondo_inicial: fondoInicial, branch_id: branchId || null }
    });
  }

  cerrarTurno(id, efectivoContado, notas) {
    return this.request(`/turnos/${id}/cerrar`, {
      method: 'PUT',
      body: { efectivo_contado: efectivoContado, notas: notas || null }
    });
  }

  getTurnoTotales(turnoId) {
    return this.request(`/turnos/${turnoId}/totales`);
  }

  // ── Movimientos de caja (BLOQUE 7) ──────────────────────────────────
  getMovimientosCaja(turnoId) {
    return this.request(`/turnos/${turnoId}/movimientos`);
  }

  registrarMovimientoCaja(turnoId, datos) {
    return this.request(`/turnos/${turnoId}/movimientos`, { method: 'POST', body: datos });
  }

  anularMovimientoCaja(turnoId, movId, datos) {
    return this.request(`/turnos/${turnoId}/movimientos/${movId}/anular`, { method: 'POST', body: datos });
  }

  getHistorialTurnos(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this.request(`/turnos/historial${q}`);
  }

  async getTurnoEventsConfig() {
    await this.ensureFreshToken();
    if (!this.token) return null;
    return {
      url: `${this.baseURL}/turnos/events`,
      options: { headers: { Authorization: `Bearer ${this.token}` } },
    };
  }

  // ─── Plan ────────────────────────────────────────────────────────────────
  getPlanStatus() {
    return this.request('/billing/status');
  }

  // ─── Empleados ───────────────────────────────────────────────────────────
  getStaff() {
    return this.request('/staff');
  }

  createStaff(data) {
    return this.request('/staff', { method: 'POST', body: data });
  }

  deleteStaff(id) {
    return this.request(`/staff/${id}`, { method: 'DELETE' });
  }

  // ─── Auditoría / PIN de empleado ─────────────────────────────────────────
  // ⚠️ `role` es el PUESTO (cajero, encargado…) y es lo que el backend puede
  // verificar: el PIN que teclea el cajero vive en los permisos del puesto, no
  // en una cuenta de usuario. Antes se mandaba el puesto como `employee_id`
  // (un texto como 'cajero'), el backend buscaba un usuario con ese id, no lo
  // encontraba y respondía 403: ningún cajero podía cancelar (CLAUDE.md §12.2).
  cancelOrderWithPin(orderId, { employee_id, role, pin, employee_name }) {
    return this.request(`/orders/${orderId}/status`, {
      method: 'PUT',
      body: { status: 'cancelado', employee_id, role, pin, employee_name }
    });
  }

  updateCustomerWithPin(id, data, { employee_id, pin, employee_name }) {
    return this.request(`/customers/${id}`, {
      method: 'PUT',
      body: { ...data, employee_id, pin, employee_name }
    });
  }

  createMovementWithPin(data, { employee_id, pin, employee_name }) {
    return this.request('/inventory/movements', {
      method: 'POST',
      body: { ...data, employee_id, pin, employee_name }
    });
  }

  getAuditLogs(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/audit${q ? '?' + q : ''}`);
  }

  async getAuditEventsConfig() {
    await this.ensureFreshToken();
    if (!this.token) return null;
    return {
      url: `${BASE_URL}/audit/events`,
      options: { headers: { Authorization: `Bearer ${this.token}` } },
    };
  }

  // ─── Push Notifications ──────────────────────────────────────────────────
  registerPushToken(token) {
    return this.request('/push/token', { method: 'POST', body: { token } });
  }

  unregisterPushToken(token) {
    return this.request('/push/token', { method: 'DELETE', body: { token } });
  }

  // ─── Lista de compras ────────────────────────────────────────────────────
  getShoppingList(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this.request(`/shopping-list${q}`);
  }

  getShoppingInventoryOptions(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this.request(`/shopping-list/inventory-options${q}`);
  }

  generateShoppingList(branchId) {
    return this.request('/shopping-list/generate', { method: 'POST', body: { branch_id: branchId || null } });
  }

  addShoppingItem(data) {
    return this.request('/shopping-list/items', { method: 'POST', body: data });
  }

  updateShoppingItem(id, data) {
    return this.request(`/shopping-list/items/${id}`, { method: 'PUT', body: data });
  }

  deleteShoppingItem(id) {
    return this.request(`/shopping-list/items/${id}`, { method: 'DELETE' });
  }

  clearShoppingList(branchId) {
    return this.request('/shopping-list/clear', { method: 'POST', body: { branch_id: branchId || null } });
  }

  sendShoppingList(branchId, sentBy) {
    return this.request('/shopping-list/send', { method: 'POST', body: { branch_id: branchId || null, sent_by: sentBy || null } });
  }
}

export const api = new ApiClient();
