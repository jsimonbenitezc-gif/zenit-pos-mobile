const BASE_URL = 'https://zenit-pos-backend.onrender.com/api';
const REQUEST_TIMEOUT_MS = 30000; // 30 segundos

class ApiClient {
  constructor() {
    this.token = null;
    this.baseURL = BASE_URL;
    this._pinFailCount = 0;
    this._pinLockedUntil = null;
    this.onUnauthorized = null; // callback para sesión expirada
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

  async request(endpoint, options = {}) {
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
        this.token = null;
        if (this.onUnauthorized) this.onUnauthorized();
        throw new Error('Sesión expirada');
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `Error ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('El servidor no respondió a tiempo. Verifica tu conexión a internet e intenta de nuevo.');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Auth ────────────────────────────────────────────────────────────────
  login(username, password) {
    return this.request('/auth/login', { method: 'POST', body: { username, password } });
  }

  staffLogin(username, password) {
    return this.request('/staff/login', { method: 'POST', body: { username, password } });
  }

  getMe() {
    return this.request('/auth/me');
  }

  // ─── Productos ───────────────────────────────────────────────────────────
  getProducts() {
    return this.request('/products');
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

  updateOrderStatus(id, status) {
    return this.request(`/orders/${id}/status`, { method: 'PUT', body: { status } });
  }

  // ─── Clientes ────────────────────────────────────────────────────────────
  getCustomers() {
    return this.request('/customers');
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

  // ─── Inventario (premium) ────────────────────────────────────────────────
  getIngredients(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this.request(`/inventory/ingredients${q}`);
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

  getInventoryEventsConfig() {
    if (!this.token) return null;
    return {
      url: `${BASE_URL}/inventory/events`,
      options: { headers: { Authorization: `Bearer ${this.token}` } },
    };
  }

  getOrdersEventsConfig() {
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

  getSettingsEventsConfig() {
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

  // ─── Mesas ───────────────────────────────────────────────────────────────
  getTables() {
    return this.request('/tables');
  }

  createTable(data) {
    return this.request('/tables', { method: 'POST', body: data });
  }

  deleteTable(id) {
    return this.request(`/tables/${id}`, { method: 'DELETE' });
  }

  addItemsToOrder(orderId, items) {
    return this.request(`/orders/${orderId}/items`, { method: 'POST', body: { items } });
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

  getHistorialTurnos(branchId) {
    const q = branchId ? `?branch_id=${branchId}` : '';
    return this.request(`/turnos/historial${q}`);
  }

  getTurnoEventsConfig() {
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
  // El PIN se verifica localmente; solo se envía el nombre del cajero al backend.
  cancelOrderWithPin(orderId, employeeName) {
    return this.request(`/orders/${orderId}/status`, {
      method: 'PUT',
      body: { status: 'cancelado', employee_name: employeeName }
    });
  }

  updateCustomerWithPin(id, data, employeeName) {
    return this.request(`/customers/${id}`, {
      method: 'PUT',
      body: { ...data, employee_name: employeeName }
    });
  }

  createMovementWithPin(data, employeeName) {
    return this.request('/inventory/movements', {
      method: 'POST',
      body: { ...data, employee_name: employeeName }
    });
  }

  getAuditLogs(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/audit${q ? '?' + q : ''}`);
  }

  getAuditEventsConfig() {
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
}

export const api = new ApiClient();
