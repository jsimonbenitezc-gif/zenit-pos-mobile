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

    const config = { ...options, headers };

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

  // ─── Ofertas (premium) ───────────────────────────────────────────────────
  getDiscounts() {
    return this.request('/offers/discounts');
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
