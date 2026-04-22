/* ========================================================
   SGO - dashboard.js  |  Manager Dashboard + Gráficos (Corrigido)
   ======================================================== */

'use strict';

let kpiRefreshTimer = null;
let chartEstadosInst = null;
let chartValoresInst = null;
let chartConcluidasInst = null;
let recentReparacoesAll = [];
let recentReparacoesPage = 1;
const RECENT_REPARACOES_PAGE_SIZE = 4;

document.addEventListener('DOMContentLoaded', () => {
  if (!initProtectedPage(['MANAGER'])) return;
  
  // Mudar cor do gráfico consoante o tema claro/escuro (usa data-theme no html)
  Chart.defaults.color = document.documentElement.getAttribute('data-theme') === 'dark' ? '#cbd5e1' : '#475569';
  
  refreshDashboard();
  loadChartFilters();
  loadUsers();
  startClock();
  initNotifications();
  
  kpiRefreshTimer = setInterval(refreshDashboard, 60000);
});

async function refreshDashboard() {
  await Promise.allSettled([loadKpis(), loadAlertasStock(), loadChartsData(), loadRecentReparacoes()]);
  const now = new Date();
  const el = document.getElementById('last-updated');
  if (el) el.textContent = `Atualizado às ${now.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
}

async function loadChartFilters() {
  const select = document.getElementById('chart-mecanico-filter');
  if (!select) return;
  try {
    const mecanicos = await api.getMecanicos() || [];
    select.innerHTML = '<option value="">Todos os mecânicos</option>' +
      mecanicos.map(m => `<option value="${m.id}">${escapeHtml(m.name || m.username || ('Mecânico #' + m.id))}</option>`).join('');
  } catch (_) {
    select.innerHTML = '<option value="">Todos os mecânicos</option>';
  }
}

function isInCurrentPeriod(dateValue, period) {
  if (!dateValue || period === 'all') return true;
  const d = new Date(dateValue);
  if (isNaN(d)) return false;

  const now = new Date();
  if (period === 'month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }

  if (period === 'week') {
    const day = (now.getDay() + 6) % 7; // monday=0
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(now.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 7);
    return d >= start && d < end;
  }

  return true;
}

/* ── Últimas Reparações ── */
async function loadRecentReparacoes() {
  const container = document.getElementById('recent-reps-list');
  if (!container) return;
  try {
    const all = await api.getReparacoes() || [];
    // Ordenar por mais recente e paginar em blocos de 4
    recentReparacoesAll = [...all].sort((a, b) => b.id - a.id);
    recentReparacoesPage = 1;

    if (!recentReparacoesAll.length) {
      container.innerHTML = '<div class="empty-state" style="padding:2rem"><div class="empty-icon">🔩</div><div class="empty-desc">Sem reparações</div></div>';
      return;
    }

    renderRecentReparacoesPage();
  } catch (_) {
    container.innerHTML = '<div class="loading-overlay" style="padding:1.5rem;font-size:.875rem;">Erro ao carregar</div>';
  }
}

function renderRecentReparacoesPage() {
  const container = document.getElementById('recent-reps-list');
  if (!container) return;

  const totalItems = recentReparacoesAll.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / RECENT_REPARACOES_PAGE_SIZE));
  if (recentReparacoesPage > totalPages) recentReparacoesPage = totalPages;
  if (recentReparacoesPage < 1) recentReparacoesPage = 1;

  const start = (recentReparacoesPage - 1) * RECENT_REPARACOES_PAGE_SIZE;
  const pageItems = recentReparacoesAll.slice(start, start + RECENT_REPARACOES_PAGE_SIZE);

  const listHtml = pageItems.map(r => `
    <div class="recent-rep-item">
      <div>
        <div class="recent-rep-matricula">${escapeHtml(r.viaturaMatricula || '—')}</div>
        <div class="recent-rep-cliente">${escapeHtml(r.clienteNome || 'Cliente desconhecido')}</div>
      </div>
      <div style="display:flex;align-items:center;gap:.75rem;">
        ${getStatusBadge(r.estado)}
        <span style="font-size:.75rem;color:var(--text-secondary)">${formatDate(r.dataInicio)}</span>
      </div>
    </div>
  `).join('');

  const paginationHtml = totalPages > 1 ? `
    <div class="recent-reps-pagination">
      <button class="btn btn-secondary btn-sm" onclick="changeRecentReparacoesPage(-1)" ${recentReparacoesPage === 1 ? 'disabled' : ''}>← Anterior</button>
      <span class="recent-reps-page-info">Página ${recentReparacoesPage} de ${totalPages}</span>
      <button class="btn btn-secondary btn-sm" onclick="changeRecentReparacoesPage(1)" ${recentReparacoesPage === totalPages ? 'disabled' : ''}>Seguinte →</button>
    </div>
  ` : '';

  container.innerHTML = `
    <div class="recent-reps-widget">
      <div class="recent-reps-list">${listHtml}</div>
      ${paginationHtml}
    </div>
  `;
}

function changeRecentReparacoesPage(delta) {
  const totalPages = Math.max(1, Math.ceil(recentReparacoesAll.length / RECENT_REPARACOES_PAGE_SIZE));
  const nextPage = recentReparacoesPage + delta;
  if (nextPage < 1 || nextPage > totalPages) return;
  recentReparacoesPage = nextPage;
  renderRecentReparacoesPage();
}

/* ── CARREGAR DADOS REAIS PARA OS GRÁFICOS ── */
async function loadChartsData() {
  try {
    const reparacoes = await api.getReparacoes();
    const mecanicoId = document.getElementById('chart-mecanico-filter')?.value || '';
    const period = document.getElementById('chart-period-filter')?.value || 'all';
    
    // Estado operacional atual: só trabalhos ativos (sem concluídas/canceladas)
    let contagem = { 'PENDENTE': 0, 'EM_EXECUCAO': 0, 'AGUARDA_PECAS': 0 };
    let valores  = { 'PENDENTE': 0, 'EM_EXECUCAO': 0, 'AGUARDA_PECAS': 0 };

    const reparacoesFiltradas = (reparacoes || []).filter(r => {
      const byMecanico = !mecanicoId || String(r.mecanicoId || '') === String(mecanicoId);
      const referenceDate = r.dataInicio || r.dataFim;
      const byPeriod = isInCurrentPeriod(referenceDate, period);
      return byMecanico && byPeriod;
    });

    if (reparacoesFiltradas.length > 0) {
      reparacoesFiltradas.forEach(r => {
        if (contagem[r.estado] !== undefined) contagem[r.estado]++;
        if (r.estado !== 'CONCLUIDA' && r.estado !== 'CANCELADA' && r.valorTotal) {
          if (valores[r.estado] !== undefined) valores[r.estado] += r.valorTotal;
        }
      });
    }

    renderChartEstados(contagem);
    renderChartValores(valores, contagem);
    renderConcluidasTendencia(reparacoesFiltradas, period);

  } catch (error) {
    console.error('Erro ao carregar dados para os gráficos:', error);
  }
}

function renderConcluidasTendencia(reparacoesFiltradas, period) {
  const concluida = reparacoesFiltradas.filter(r => r.estado === 'CONCLUIDA' && r.dataFim);
  const valueEl = document.getElementById('concluidas-periodo-value');
  if (valueEl) valueEl.textContent = String(concluida.length);

  const canvas = document.getElementById('chartConcluidas');
  if (!canvas) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const ctx = canvas.getContext('2d');

  if (chartConcluidasInst) chartConcluidasInst.destroy();

  const trend = buildConcluidasSeries(concluida, period);
  chartConcluidasInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: trend.labels,
      datasets: [{
        label: 'Concluídas',
        data: trend.data,
        backgroundColor: 'rgba(16,185,129,.65)',
        borderColor: '#10b981',
        borderWidth: 1,
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            precision: 0,
            color: isDark ? '#94a3b8' : '#64748b'
          },
          grid: { color: isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)' }
        },
        x: {
          ticks: { color: isDark ? '#94a3b8' : '#64748b' },
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` Concluídas: ${ctx.raw}`
          }
        }
      }
    }
  });
}

function buildConcluidasSeries(concluidas, period) {
  if (period === 'week') {
    const labels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
    const data = [0, 0, 0, 0, 0, 0, 0];
    concluidas.forEach(r => {
      const d = new Date(r.dataFim);
      const idx = (d.getDay() + 6) % 7;
      data[idx] += 1;
    });
    return { labels, data };
  }

  if (period === 'month') {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const maxDay = new Date(year, month + 1, 0).getDate();
    const weekCount = Math.ceil(maxDay / 7);
    const labels = Array.from({ length: weekCount }, (_, i) => `Sem ${i + 1}`);
    const data = Array.from({ length: weekCount }, () => 0);
    concluidas.forEach(r => {
      const d = new Date(r.dataFim);
      const weekIdx = Math.floor((d.getDate() - 1) / 7);
      if (weekIdx >= 0 && weekIdx < data.length) data[weekIdx] += 1;
    });
    return { labels, data };
  }

  // Todo o período: últimos 6 meses
  const labels = [];
  const data = [];
  const cursor = new Date();
  cursor.setDate(1);
  for (let i = 5; i >= 0; i--) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth() - i, 1);
    labels.push(d.toLocaleDateString('pt-PT', { month: 'short' }));
    data.push(0);
  }
  concluidas.forEach(r => {
    const d = new Date(r.dataFim);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    for (let i = 0; i < 6; i++) {
      const cmp = new Date(cursor.getFullYear(), cursor.getMonth() - (5 - i), 1);
      if (key === `${cmp.getFullYear()}-${cmp.getMonth()}`) {
        data[i] += 1;
        break;
      }
    }
  });
  return { labels, data };
}

/* ── DESENHAR O GRÁFICO CIRCULAR ── */
function renderChartEstados(contagem) {
  const canvas = document.getElementById('chartEstados');
  if (!canvas) return;
  
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const ctx = canvas.getContext('2d');
  
  if (chartEstadosInst) chartEstadosInst.destroy();

  chartEstadosInst = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Pendentes', 'Em Execução', 'Aguarda Peças'],
      datasets: [{
        data: [contagem.PENDENTE, contagem.EM_EXECUCAO, contagem.AGUARDA_PECAS],
        backgroundColor: ['#3b82f6', '#eab308', '#f97316'],
        borderWidth: 2,
        borderColor: isDark ? '#1e293b' : '#ffffff',
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: isDark ? '#cbd5e1' : '#475569',
            usePointStyle: true,
            padding: 16
          }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw} trabalhos ativos`
          }
        }
      }
    }
  });
}

/* ── DESENHAR O GRÁFICO DE BARRAS ── */
function renderChartValores(valores) {
  const canvas = document.getElementById('chartValores');
  if (!canvas) return;

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const ctx = canvas.getContext('2d');
  const data = [valores.PENDENTE || 0, valores.EM_EXECUCAO || 0, valores.AGUARDA_PECAS || 0];
  const total = data.reduce((acc, v) => acc + v, 0);
  const maxValue = Math.max(...data, 0);
  const emptyEl = document.getElementById('chart-valores-empty');

  if (emptyEl) {
    if (total <= 0) emptyEl.classList.remove('hidden');
    else emptyEl.classList.add('hidden');
  }

  const g1 = ctx.createLinearGradient(0, 0, 0, 260);
  g1.addColorStop(0, 'rgba(59,130,246,.95)');
  g1.addColorStop(1, 'rgba(59,130,246,.35)');

  const g2 = ctx.createLinearGradient(0, 0, 0, 260);
  g2.addColorStop(0, 'rgba(234,179,8,.95)');
  g2.addColorStop(1, 'rgba(234,179,8,.35)');

  const g3 = ctx.createLinearGradient(0, 0, 0, 260);
  g3.addColorStop(0, 'rgba(249,115,22,.95)');
  g3.addColorStop(1, 'rgba(249,115,22,.35)');
  
  if (chartValoresInst) chartValoresInst.destroy();

  chartValoresInst = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Pendentes', 'Em Execução', 'Aguarda Peças'],
      datasets: [{
        label: 'Valor em Euros (€)',
        data,
        backgroundColor: [g1, g2, g3],
        borderColor: ['#3b82f6','#eab308','#f97316'],
        borderWidth: 1,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          suggestedMax: maxValue > 0 ? Math.ceil(maxValue * 1.2) : 100,
          grid: { color: isDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)' },
          ticks: {
            color: isDark ? '#94a3b8' : '#64748b',
            callback: v => formatCurrency(v)
          }
        },
        x: {
          grid: { display: false },
          ticks: { color: isDark ? '#94a3b8' : '#64748b' }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${formatCurrency(ctx.raw || 0)}`
          }
        }
      }
    }
  });
}

/* ── KPIs ── */
async function loadKpis() {
  try {
    const data = await api.getKpis();
    renderKpis(data);
  } catch (err) {
    document.getElementById('kpi-grid').innerHTML = `<div class="kpi-card" style="grid-column:1/-1"><div class="alert alert-danger">❌ Erro a carregar KPIs</div></div>`;
  }
}

function renderKpis(data) {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;
  const kpis = [
    {
      label: 'Faturação Hoje', value: formatCurrency(data.faturacaoHoje ?? 0),
      icon: '💶', iconClass: 'kpi-icon-blue', meta: 'faturado hoje'
    },
    {
      label: 'Faturação Mês', value: formatCurrency(data.faturacaoMes ?? 0),
      icon: '🗓️', iconClass: 'kpi-icon-green', meta: 'este mês'
    },
    {
      label: 'Reparações em Curso', value: data.reparacoesEmCurso ?? 0,
      icon: '🔧', iconClass: 'kpi-icon-orange', meta: 'atualmente na oficina'
    },
    {
      label: 'Concluídas Hoje', value: data.reparacoesConcluidas ?? 0,
      icon: '✅', iconClass: 'kpi-icon-purple', meta: 'terminadas hoje'
    }
  ];
  grid.innerHTML = kpis.map((k, i) => `
    <div class="kpi-card" style="animation-delay:${i * 0.07}s">
      <div class="kpi-icon ${k.iconClass}">${k.icon}</div>
      <div class="kpi-info">
        <div class="kpi-label">${k.label}</div>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-meta">${k.meta}</div>
      </div>
    </div>
  `).join('');
  renderOcupacao(data.ocupacaoAtual ?? 0, data.capacidadeMaxima ?? 8);
}

function renderOcupacao(atual, max) {
  const textEl  = document.getElementById('ocupacao-text');
  const barEl   = document.getElementById('ocupacao-bar');
  const badgeEl = document.getElementById('ocupacao-badge');
  if (!textEl) return;
  const a = parseInt(atual) || 0;
  const m = parseInt(max)   || 8;
  const pct = m > 0 ? Math.round((a / m) * 100) : 0;
  textEl.textContent = `${a}/${m}`;
  if (barEl) {
    barEl.style.width = `${pct}%`;
    barEl.className = 'progress-bar ' + (pct < 50 ? 'green' : pct <= 75 ? 'yellow' : 'red');
  }
  if (badgeEl) {
    badgeEl.className = 'badge ' + (pct < 50 ? 'badge-success' : pct <= 75 ? 'badge-warning' : 'badge-danger');
    badgeEl.textContent = `${pct}% – ` + (pct < 50 ? 'Disponível' : pct <= 75 ? 'Moderado' : 'Cheio');
  }
}

/* ── Alertas de Stock ── */
async function loadAlertasStock() {
  const tbody = document.getElementById('alertas-tbody');
  const card = document.getElementById('card-alertas-stock');
  if (!tbody || !card) return;
  try {
    const data = await api.getAlertasStock();
    if (!data || data.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:1.5rem">✅ Sem alertas de stock</td></tr>`;
      card.style.boxShadow = "none";
      card.style.border = "1px solid var(--border)";
      return;
    }
    
    card.style.border = "2px solid #ef4444";
    card.style.boxShadow = "0 0 15px rgba(239, 68, 68, 0.2)";

    tbody.innerHTML = data.map(p => `
      <tr>
        <td><code>${escapeHtml(p.referencia)}</code></td>
        <td><strong>${escapeHtml(p.designacao)}</strong></td>
        <td class="stock-low" style="font-size: 1.1rem;">${p.quantidadeStock || p.stockAtual}</td>
        <td>${p.stockMinimo}</td>
      </tr>
    `).join('');
  } catch (err) { 
      tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Erro ao carregar alertas</td></tr>`; 
  }
}

/* ── Lógica de Utilizadores ── */
let allUsers = [];

async function loadUsers() {
  try { 
      allUsers = await api.getUsers() || []; 
      renderUsersTable(allUsers); 
  } 
  catch (err) { 
      const tbody = document.getElementById('users-tbody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Erro</td></tr>`; 
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('users-tbody');
  if (!tbody) return;

  if (!users.length) { 
    tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted" style="padding:1.5rem">Nenhum utilizador encontrado</td></tr>`; 
    return; 
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="display:flex;align-items:center;gap:.75rem;">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:.75rem;flex-shrink:0;">${escapeHtml(getInitials(u.name || u.username))}</div>
          <strong>${escapeHtml(u.name || u.username)}</strong>
        </div>
      </td>
      <td><code style="font-size:.8rem;">${escapeHtml(u.username)}</code></td>
      <td><span class="badge badge-${u.role === 'MANAGER' ? 'primary' : u.role === 'MECHANIC' ? 'success' : 'warning'}">${escapeHtml(getRoleLabel(u.role))}</span></td>
      <td style="color:var(--text-secondary);font-size:.8rem;">${escapeHtml(u.email || '—')}</td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openEditUser(${u.id})">✏️</button> 
        <button class="btn btn-outline-danger btn-sm" onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')">🗑️</button>
      </td>
    </tr>`).join('');
}

function openCreateUser() { 
    document.getElementById('modal-user-title').textContent = 'Novo Utilizador'; 
    document.getElementById('form-user').reset(); 
    document.getElementById('user-id').value = ''; 
    const hint = document.getElementById('pw-hint');
    if (hint) hint.textContent = '(obrigatória)'; 
    const pwInput = document.getElementById('user-password');
    if (pwInput) pwInput.required = true; 
    showModal('modal-user'); 
}

function openEditUser(id) { 
    const user = allUsers.find(u => u.id === id); 
    if (!user) return; 
    document.getElementById('modal-user-title').textContent = 'Editar Utilizador'; 
    document.getElementById('user-id').value = user.id; 
    document.getElementById('user-name').value = user.name || ''; 
    document.getElementById('user-username').value = user.username || ''; 
    document.getElementById('user-email').value = user.email || ''; 
    document.getElementById('user-role').value = user.role || ''; 
    const pwInput = document.getElementById('user-password');
    if (pwInput) {
        pwInput.value = ''; 
        pwInput.required = false; 
    }
    const hint = document.getElementById('pw-hint');
    if (hint) hint.textContent = '(opcional)'; 
    showModal('modal-user'); 
}

async function submitUser(e) { 
    e.preventDefault(); 
    const payload = { 
        name: document.getElementById('user-name').value.trim(), 
        username: document.getElementById('user-username').value.trim(), 
    email: document.getElementById('user-email').value.trim() || null,
        role: document.getElementById('user-role').value 
    }; 
    const id = document.getElementById('user-id').value;
    const passwordInput = document.getElementById('user-password');
    const password = passwordInput ? passwordInput.value : ''; 
    
    if (password) payload.password = password; 
    
    try { 
        if (id) { 
            await api.updateUser(id, payload); 
            showToast('Utilizador atualizado!', 'success'); 
        } else { 
            if (!password) {
                showToast('Palavra-passe obrigatória', 'error'); 
                return;
            }
            await api.createUser(payload); 
            showToast('Utilizador criado!', 'success'); 
        } 
        hideModal('modal-user'); 
        await loadUsers(); 
    } catch (err) { 
        showToast('Erro: ' + err.message, 'error'); 
    } 
}

async function deleteUser(id, username) { 
    // Segurança: Prevenir que o admin se apague a si próprio e fique trancado fora da plataforma
    const currentUser = getCurrentUser();
    if (currentUser && currentUser.id === id) {
        showToast('Não pode eliminar a sua própria conta!', 'error');
        return;
    }

    const ok = await confirmDialog(`Eliminar o utilizador "${username}"?`); 
    if (!ok) return; 
    
    try { 
        await api.deleteUser(id); 
        showToast('Utilizador eliminado.', 'success'); 
        
        // 🧹 Forçar a atualização da tabela no ecrã!
        await loadUsers(); 
        
    } catch (err) { 
        showToast('Erro: ' + err.message, 'error'); 
    } 
}