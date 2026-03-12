const BASE_URL = 'https://zenit-pos-backend.onrender.com/api';

class ApiClient {
  constructor() {
    this.token = null;
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

    const config = { ...options, headers, cache: 'no-store' };

    if (options.body && typeof options.body === 'object') {
      config.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, config);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Error ${response.status}`);
    }

    return response.json();
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

  // ─── Estadísticas ────────────────────────────────────────────────────────
  getDashboard() {
    return this.request('/stats/dashboard');
  }

  // ─── Inventario (premium) ────────────────────────────────────────────────
  getIngredients() {
    return this.request('/inventory/ingredients');
  }

  createMovement(data) {
    return this.request('/inventory/movements', { method: 'POST', body: data });
  }

  getPreparations() {
    return this.request('/inventory/preparations');
  }

  createPreparation(data) {
    return this.request('/inventory/preparations', { method: 'POST', body: data });
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

  getMovements(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.request(`/inventory/movements${q ? '?' + q : ''}`);
  }

  // ─── Ofertas (premium) ───────────────────────────────────────────────────
  getDiscounts() {
    return this.request('/offers/discounts');
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

  updateCustomerLoyalty(id, data) {
    return this.request(`/customers/${id}/loyalty`, { method: 'PATCH', body: data });
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
}

export const api = new ApiClient();
