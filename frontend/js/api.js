/* ========================================================
   SGO - api.js  |  HTTP Client with Auth Headers
   ======================================================== */

'use strict';

const API_BASE = 'http://localhost:8080/sgo/api';

function getHeaders() {
  const token = sessionStorage.getItem('sgo_token');
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  };
}

async function apiRequest(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: getHeaders(),
  };
  if (body !== null) {
    options.body = JSON.stringify(body);
  }
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, options);

    if (response.status === 401) {
      sessionStorage.clear();
      if (!window.location.pathname.endsWith('index.html') && window.location.pathname !== '/' && window.location.pathname !== '') {
        window.location.href = 'index.html';
      }
      let errMsg = 'Credenciais inválidas ou sessão expirada.';
      try {
        const errBody = await response.json();
        errMsg = errBody.message || errBody.error || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }

    if (response.status === 204 || response.status === 205) {
      return null;
    }

    if (!response.ok) {
      let errMsg = `Erro ${response.status}`;
      try {
        const errBody = await response.json();
        errMsg = errBody.message || errBody.error || errMsg;
      } catch (_) { }
      throw new Error(errMsg);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return response.json();
    }
    return null;
  } catch (err) {
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      throw new Error('Não foi possível conectar ao servidor. Verifique a sua ligação.');
    }
    throw err;
  }
}

/* ── API Object ── */
const api = {

  /* Auth */
  login: (credentials) => apiRequest('/auth/login', 'POST', credentials),

  /* Clientes */
  getClientes: (search) => apiRequest(`/clientes${search ? '?search=' + encodeURIComponent(search) : ''}`),
  getCliente: (id) => apiRequest(`/clientes/${id}`),
  createCliente: (data) => apiRequest('/clientes', 'POST', data),
  updateCliente: (id, data) => apiRequest(`/clientes/${id}`, 'PUT', data),
  deleteCliente: (id) => apiRequest(`/clientes/${id}`, 'DELETE'),
  getClienteViaturas: (id) => apiRequest(`/clientes/${id}/viaturas`),
  getClienteReparacoes: (id) => apiRequest(`/clientes/${id}/reparacoes`),

  /* Viaturas */
  getViaturas: (search) => apiRequest(`/viaturas${search ? '?search=' + encodeURIComponent(search) : ''}`),
  getViatura: (id) => apiRequest(`/viaturas/${id}`),
  createViatura: (data) => apiRequest('/viaturas', 'POST', data),
  updateViatura: (id, data) => apiRequest(`/viaturas/${id}`, 'PUT', data),
  deleteViatura: (id) => apiRequest(`/viaturas/${id}`, 'DELETE'),
  getViaturaByMatricula: (matricula) => apiRequest(`/viaturas/matricula/${encodeURIComponent(matricula)}`),
  getViaturaReparacoes: (id) => apiRequest(`/viaturas/${id}/reparacoes`),

  /* Agenda */
  getAgendaSemana: (data) => apiRequest(`/agenda/semana/${data}`),
  getAgendaSlot: (data, hora) => apiRequest(`/agenda/slot?data=${data}&hora=${hora}`),
  createAgendamento: (data) => apiRequest('/agenda', 'POST', data),
  updateAgendamento: (id, data) => apiRequest(`/agenda/${id}`, 'PUT', data),
  cancelarAgendamento: (id) => apiRequest(`/agenda/${id}`, 'DELETE'),

  /* Reparações */
  getReparacoes: (params) => apiRequest(`/reparacoes${params ? '?' + params : ''}`),
  getReparacao: (id) => apiRequest(`/reparacoes/${id}`),
  getReparacoesMecanico: (mecId) => apiRequest(`/reparacoes/mecanico/${mecId}`),
  createReparacao: (data) => apiRequest('/reparacoes', 'POST', data),
  updateReparacao: (id, data) => apiRequest(`/reparacoes/${id}`, 'PUT', data),
  updateEstadoReparacao: (id, estado) => apiRequest(`/reparacoes/${id}/estado`, 'PUT', { estado }),
  deleteReparacao: (id) => apiRequest(`/reparacoes/${id}`, 'DELETE'),
  addOperacao: (id, data) => apiRequest(`/reparacoes/${id}/operacoes`, 'POST', data),
  updateOperacao: (rId, opId, data) => apiRequest(`/reparacoes/${rId}/operacoes/${opId}`, 'PUT', data),
  deleteOperacao: (rId, opId) => apiRequest(`/reparacoes/${rId}/operacoes/${opId}`, 'DELETE'),

  /* Peças & Armazém */
  getPecas: (search) => apiRequest(`/pecas${search ? '?search=' + encodeURIComponent(search) : ''}`),
  getPeca: (id) => apiRequest(`/pecas/${id}`),
  createPeca: (data) => apiRequest('/pecas', 'POST', data),
  updatePeca: (id, data) => apiRequest(`/pecas/${id}`, 'PUT', data),
  deletePeca: (id) => apiRequest(`/pecas/${id}`, 'DELETE'),
  getAlertasStock: () => apiRequest('/pecas/alertas-stock'),
  requisitarPeca: (id, data) => apiRequest(`/pecas/${id}/requisitar`, 'POST', data),
  
  // A Função de Movimento Corrigida!
  registerMovimentoStock: (id, data) => {
    const endpoint = data.tipo === 'ENTRADA' ? `/pecas/${id}/entrada-stock` : `/pecas/${id}/saida-stock`;
    const payload = {
      quantidade: data.quantidade,
      observacoes: data.observacoes,
      ...(data.precoCusto !== undefined ? { precoCusto: data.precoCusto } : {}),
    };
    return apiRequest(endpoint, 'POST', payload);
  },

  /* Dashboard */
  getKpis: () => apiRequest('/dashboard/kpis'),
  getOcupacao: () => apiRequest('/dashboard/ocupacao'),

  /* Users */
  getUsers: () => apiRequest('/users'),
  getMecanicos: () => apiRequest('/users?role=MECHANIC'),
  getUser: (id) => apiRequest(`/users/${id}`),
  createUser: (data) => apiRequest('/users', 'POST', data),
  updateUser: (id, data) => apiRequest(`/users/${id}`, 'PUT', data),
  deleteUser: (id) => apiRequest(`/users/${id}`, 'DELETE'),

  /* Logs (real DB) */
  getLogs: (params) => apiRequest(`/logs${params ? '?' + params : ''}`),
  deleteLogs: () => apiRequest('/logs', 'DELETE'),

  /* Faturação — usa reparacoes com estado CONCLUIDA */
  getFaturas: (params) => apiRequest(`/reparacoes${params ? '?' + params : ''}`),
};