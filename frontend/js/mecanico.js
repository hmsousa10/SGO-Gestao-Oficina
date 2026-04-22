/* ========================================================
   SGO - mecanico.js  |  Mechanic Work Panel (Automação de Peças)
   ======================================================== */

'use strict';

const CHECKLIST_ITEMS = [
  'Verificação de óleo', 'Verificação de travões', 'Verificação de suspensão', 'Verificação de pneus',
  'Diagnóstico eletrónico', 'Verificação de luzes', 'Verificação de fluidos', 'Verificação de bateria'
];

let allRepairs      = [];
let currentRepair   = null;
let allPecas        = [];
let timerInterval   = null;
let timerSeconds    = 0;
let timerRunning    = false;
let currentOpId     = null; 
let pecaEmRequisicaoNome = ''; // Guarda o nome da peça para criar a operação

document.addEventListener('DOMContentLoaded', async () => {
  if (!initProtectedPage(['MECHANIC', 'MANAGER', 'ADMIN'])) return;
  const user = getCurrentUser();
  if (user) {
    const userNameEl = document.getElementById('top-user-name');
    if (userNameEl) userNameEl.textContent = `Bem-vindo, ${user.name || user.nome || 'Mecânico'}`;
    if (user.role === 'MANAGER' || user.role === 'ADMIN') {
        await setupAdminFilter();
        await loadMyRepairs();
    } else {
        await loadMyRepairs(user.id);
    }
  }
});

async function setupAdminFilter() {
    const filterContainer = document.getElementById('admin-filter-container');
    const selector = document.getElementById('mecanico-selector');
    if (filterContainer && selector) {
        filterContainer.style.display = 'flex'; 
        try {
            const mecanicos = await api.getMecanicos();
            mecanicos.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.textContent = m.name || m.username;
                selector.appendChild(opt);
            });
        } catch (err) { console.error("Erro", err); }
    }
}

function voltarGlobal() {
  const viewDetails = document.getElementById('view-details');
  if (viewDetails && !viewDetails.classList.contains('hidden')) {
    backToDashboard();
  } else {
    const user = getCurrentUser();
    if (user && user.role === 'MANAGER') window.location.href = 'dashboard.html'; 
    else window.location.href = 'index.html?bypassAuth=true';
  }
}

function backToDashboard() {
  document.getElementById('view-details').classList.add('hidden');
  document.getElementById('view-details').classList.remove('active');
  document.getElementById('view-dashboard').classList.remove('hidden');
  document.getElementById('view-dashboard').classList.add('active');
  
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    localStorage.setItem(getTimerKey(), timerSeconds);
  }
  
  currentRepair = null;
  const selector = document.getElementById('mecanico-selector');
  loadMyRepairs(selector ? selector.value : null); 
}

async function loadMyRepairs(filterMecanicoId = null) {
  const user = getCurrentUser();
  if (!user) return;
  const tbody = document.getElementById('repair-list');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6"><div class="loading-overlay"><div class="spinner"></div></div></td></tr>`;

  try {
    let data = [];
    if (filterMecanicoId) data = await api.getReparacoesMecanico(filterMecanicoId) || [];
    else if (user.role === 'MANAGER' || user.role === 'ADMIN') data = await api.getReparacoes() || [];
    else data = await api.getReparacoesMecanico(user.id) || [];
    
    document.getElementById('kpi-pendentes').textContent = data.filter(r => r.estado === 'PENDENTE').length;
    document.getElementById('kpi-progresso').textContent = data.filter(r => r.estado === 'EM_EXECUCAO' || r.estado === 'EM_PROGRESSO').length;
    document.getElementById('kpi-pecas').textContent = data.filter(r => r.estado === 'AGUARDA_PECAS').length;
    document.getElementById('kpi-concluidos').textContent = data.filter(r => r.estado === 'CONCLUIDA').length;

    allRepairs = data.filter(r => ['PENDENTE', 'EM_PROGRESSO', 'EM_EXECUCAO', 'AGUARDA_PECAS'].includes(r.estado));
    renderRepairList();
  } catch (err) { tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">❌ Erro: ${escapeHtml(err.message)}</td></tr>`; }
}

function renderRepairList() {
  const tbody = document.getElementById('repair-list');
  if (!tbody) return;
  if (!allRepairs.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center" style="padding: 2rem;">🎉 Sem trabalho pendente na fila para a seleção atual.</td></tr>`;
    return;
  }
  tbody.innerHTML = allRepairs.map(r => {
    const matricula = r.viaturaMatricula || '#' + r.id;
    const veiculo = `${r.viaturaMarca || ''} ${r.viaturaModelo || ''}`.trim() || '—';
    const cliente = r.clienteNome || '—';
    const mecanico = r.mecanicoNome || '<span style="color:#e74c3c; font-size:0.85em;">Não Atribuído</span>';
    return `
      <tr>
        <td><strong>${escapeHtml(matricula)}</strong></td>
        <td>${escapeHtml(veiculo)}</td>
        <td>${escapeHtml(cliente)}</td>
        <td>${mecanico}</td>
        <td>${getStatusBadge(r.estado)}</td>
        <td><button class="btn btn-primary btn-sm" onclick="selectReparacao(${r.id})">👀 Ver Detalhes</button></td>
      </tr>`;
  }).join('');
}

async function selectReparacao(id) {
  if (timerRunning) { clearInterval(timerInterval); timerRunning = false; }
  try {
    currentRepair = await api.getReparacao(id);
    timerSeconds = parseInt(localStorage.getItem(getTimerKey())) || 0;
    
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-dashboard').classList.remove('active');
    document.getElementById('view-details').classList.remove('hidden');
    document.getElementById('view-details').classList.add('active');

    renderDetailPanel();
    window.scrollTo(0,0);
  } catch (err) { showToast('Erro ao carregar: ' + err.message, 'error'); }
}

function updateRepairState(newState) {
  if (!currentRepair) return;
  if (currentRepair.estado === newState) return; 
  
  api.updateEstadoReparacao(currentRepair.id, newState)
    .then(async () => {
      showToast('Estado atualizado com sucesso!', 'success');
      currentRepair = await api.getReparacao(currentRepair.id);
      renderDetailPanel();
    })
    .catch(err => showToast('Erro ao mudar estado: ' + err.message, 'error'));
}

function renderDetailPanel() {
  const wrapper = document.getElementById('details-content-wrapper');
  if (!wrapper || !currentRepair) return;
  const r = currentRepair;

  const s = r.estado;
  // Backend usa EM_EXECUCAO — manter consistência
  const isEmExec = (s === 'EM_EXECUCAO');
  const isAguarda = (s === 'AGUARDA_PECAS');
  const isPronto  = (s === 'CONCLUIDA');
  let badgeClass  = isEmExec ? 'badge-execucao' : (isPronto ? 'badge-concluida' : 'badge-pendente');
  let badgeText   = s.replace(/_/g,' ');

  let progressWidth = '0%';
  if (isPronto) progressWidth = '100%';
  else if (isEmExec || isAguarda) progressWidth = '50%';

  wrapper.innerHTML = `
    <div class="intervention-top-bar">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <span class="intervention-badge ${badgeClass}">${badgeText}</span>
        <span style="color: #94a3b8; font-size: 0.95rem;">Início: ${formatTimeOnly(r.dataInicio)}</span>
      </div>
      <div class="intervention-timer">
        ⏱ <span id="stopwatch-display">${formatStopwatch(timerSeconds)}</span>
        <div style="display: flex; gap: 0.5rem; margin-left: 1rem;">
          <button class="btn btn-sm ${timerRunning ? 'btn-warning' : 'btn-success'}" id="btn-toggle-timer" onclick="handleTimerClick()">
            ${timerRunning ? '⏸ Pausar' : '▶ Retomar'}
          </button>
          <button class="btn btn-secondary btn-sm" onclick="saveTimeToOperation()" title="Gravar este tempo numa operação na BD">
            💾 Guardar na BD
          </button>
        </div>
      </div>
    </div>
    <div class="intervention-header">
      <div class="vehicle-main-info">
        <div class="plate-highlight">${escapeHtml(r.viaturaMatricula || '—')}</div>
        <div class="vehicle-text">
          <h2>${escapeHtml(r.viaturaMarca || '')} ${escapeHtml(r.viaturaModelo || '')}</h2>
          <p>${escapeHtml(r.descricao || 'Serviço Geral')}</p>
        </div>
      </div>
      <div class="client-info">
        <p>Cliente</p>
        <h3>👤 ${escapeHtml(r.clienteNome || '—')}</h3>
      </div>
    </div>
    <div class="stepper-wrapper">
      <div class="stepper-container">
        <div class="stepper-progress" style="width: ${progressWidth};"></div>
        <div class="step ${r.estado === 'PENDENTE' ? 'active' : 'completed'}" title="Voltar para fila de espera" onclick="updateRepairState('PENDENTE')">
          <div class="step-icon">✓</div><span class="step-label">Receção</span>
        </div>
        <div class="step ${(r.estado === 'EM_EXECUCAO' || r.estado === 'AGUARDA_PECAS') ? 'active' : (isPronto ? 'completed' : '')}" title="Colocar em execução" onclick="updateRepairState('EM_EXECUCAO')">
          <div class="step-icon">${(r.estado === 'EM_EXECUCAO' || r.estado === 'AGUARDA_PECAS' || isPronto) ? '✓' : '⚙️'}</div><span class="step-label">Execução</span>
        </div>
        <div class="step ${isPronto ? 'completed' : ''}" title="Finalizar viatura" onclick="concluirReparacao()">
          <div class="step-icon">${isPronto ? '✓' : '🏁'}</div><span class="step-label">Pronto</span>
        </div>
      </div>
    </div>
    <div class="action-cards-grid">
      <button class="action-card card-blue" onclick="openTrabalhosModal()">
        <span class="action-card-icon">📋</span><span class="action-card-title">Checklist & Diagnóstico</span>
      </button>
      <button class="action-card card-yellow" onclick="openGestaoPecasModal()">
        <span class="action-card-icon">📦</span><span class="action-card-title">Armazém / Peças</span>
      </button>
      <button class="action-card card-green" onclick="concluirReparacao()">
        <span class="action-card-icon">✅</span><span class="action-card-title">Concluir Trabalho</span>
      </button>
    </div>
    <!-- Peças Aplicadas -->
    ${renderPecasAplicadas(r)}
  `;
}

function formatTimeOnly(dateString) {
  if (!dateString) return '--:--';
  const d = new Date(dateString);
  return d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}

/* ── Card: Peças Aplicadas a esta Reparação ── */
function renderPecasAplicadas(r) {
  const movimentos = r.pecas || r.pecasUsadas || r.movimentosStock || [];
  const valorOps = (r.operacoes || []).reduce((sum, o) => sum + (o.tempoRealMinutos || 0) * 1.5, 0); // €1.5/min mão obra
  const valorPecas = movimentos.reduce((sum, m) => {
    const qtd = Math.abs(m.quantidade || 0);
    const preco = m.precoUnitario || m.precoPeca || 0;
    return sum + (preco * qtd);
  }, 0);
  const valorTotal = r.valorTotal ? parseFloat(r.valorTotal) : (valorOps + valorPecas);

  if (!movimentos.length) {
    return `<div class="card" style="margin-top:1.5rem;">
      <div class="card-header"><h3 class="card-title">🔧 Materiais Utilizados</h3></div>
      <div class="card-body"><p class="text-muted" style="text-align:center;">Nenhuma peça retirada do armazém ainda.</p></div>
    </div>`;
  }
  return `<div class="card" style="margin-top:1.5rem;">
    <div class="card-header">
      <h3 class="card-title">🔧 Materiais Utilizados</h3>
      <span class="badge badge-primary">${movimentos.length} peça(s)</span>
    </div>
    <div class="card-body" style="padding:0;">
      <table style="width:100%;border-collapse:collapse;font-size:.875rem;">
        <thead><tr style="background:var(--bg);"><th style="padding:.5rem 1rem;text-align:left;">Peça</th><th style="padding:.5rem;text-align:center;">Qtd</th><th style="padding:.5rem 1rem;text-align:right;">Preço Unit.</th></tr></thead>
        <tbody>${movimentos.map(m => `
          <tr style="border-top:1px solid var(--border);">
            <td style="padding:.6rem 1rem;">${escapeHtml(m.designacao || m.pecaDesignacao || '—')}</td>
            <td style="padding:.6rem;text-align:center;"><strong>${Math.abs(m.quantidade)}</strong></td>
            <td style="padding:.6rem 1rem;text-align:right;">${formatCurrency(m.precoUnitario || m.precoPeca || 0)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="padding:1rem;border-top:2px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <span style="font-weight:600;">Valor Total Estimado:</span>
        <span style="font-size:1.25rem;font-weight:800;color:var(--primary);">${formatCurrency(valorTotal)}</span>
      </div>
    </div>
  </div>`;
}

function getTimerKey() { return 'sgo_timer_' + (currentRepair?.id || 'unknown'); }

function handleTimerClick() {
  if (timerRunning) {
    clearInterval(timerInterval);
    timerRunning = false;
    localStorage.setItem(getTimerKey(), timerSeconds);
    document.getElementById('btn-toggle-timer').className = 'btn btn-sm btn-success';
    document.getElementById('btn-toggle-timer').innerHTML = '▶ Retomar';
    showModal('modal-pausa');
  } else {
    timerRunning = true;
    timerInterval = setInterval(() => {
      timerSeconds++;
      const display = document.getElementById('stopwatch-display');
      if (display) display.textContent = formatStopwatch(timerSeconds);
      localStorage.setItem(getTimerKey(), timerSeconds);
    }, 1000);
    document.getElementById('btn-toggle-timer').className = 'btn btn-sm btn-warning';
    document.getElementById('btn-toggle-timer').innerHTML = '⏸ Pausar';
    
    if (currentRepair && currentRepair.estado !== 'EM_EXECUCAO') {
       updateRepairState('EM_EXECUCAO');
    }
  }
}

async function submitPausa(tipoMotivo) {
  hideModal('modal-pausa');
  if (tipoMotivo === 'NORMAL') {
      showToast('Cronómetro em Pausa Normal.', 'info');
  } else if (tipoMotivo === 'PECAS') {
      showToast('Viatura em espera de peças...', 'warning');
      await api.updateEstadoReparacao(currentRepair.id, 'AGUARDA_PECAS');
      backToDashboard(); 
  } else if (tipoMotivo === 'CLIENTE') {
      showToast('A aguardar aprovação. Viatura Pendente.', 'info');
      await api.updateEstadoReparacao(currentRepair.id, 'PENDENTE');
      backToDashboard(); 
  }
}

function saveTimeToOperation() {
  if (timerRunning) handleTimerClick(); 
  if (!currentOpId) {
    showToast('Aviso: Tem de clicar em Editar (✏️) numa operação para indicar onde quer guardar este tempo!', 'warning');
    return;
  }
  const minutes = Math.ceil(timerSeconds / 60);
  if (minutes <= 0) {
    showToast('O tempo registado é inferior a 1 minuto.', 'info');
    return;
  }
  const op = (currentRepair.operacoes || []).find(o => o.id === currentOpId);
  if (op) {
    api.updateOperacao(currentRepair.id, currentOpId, { descricao: op.descricao, tempoRealMinutos: minutes })
    .then(async () => {
       showToast(`Tempo de ${formatDuration(minutes)} adicionado com sucesso!`, 'success');
       timerSeconds = 0;
       localStorage.removeItem(getTimerKey());
       document.getElementById('stopwatch-display').textContent = formatStopwatch(0);
       currentRepair = await api.getReparacao(currentRepair.id);
       renderDetailPanel();
    })
    .catch(err => showToast('Erro ao gravar tempo: ' + err.message, 'error'));
  }
}

function openTrabalhosModal() {
  if (!currentRepair) return;
  const opList = document.getElementById('op-list');
  if (opList) opList.innerHTML = renderOperacoes(currentRepair.operacoes || []);
  const chkList = document.getElementById('checklist');
  if (chkList) chkList.innerHTML = renderChecklist();
  showModal('modal-trabalhos');
}

function renderOperacoes(operacoes) {
  if (!operacoes.length) return `<p class="text-muted" style="text-align:center;">Sem operações registadas. Adicione a primeira.</p>`;
  return operacoes.map(op => `
    <div style="padding: 1rem; border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 0.5rem; background: var(--bg); ${currentOpId === op.id ? 'border-left: 4px solid var(--primary-color)' : ''}">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="font-size: 1.05rem;">${escapeHtml(op.descricao)}</strong>
          ${currentOpId === op.id ? '<span class="badge badge-primary" style="margin-left: 5px;">📍 Cronómetro Alocado Aqui</span>' : ''}
          <div style="margin-top: 0.3rem; font-size: 0.9rem;">
            ${op.tempoEstimadoMinutos ? '⏱ Est: ' + formatDuration(op.tempoEstimadoMinutos) : '⏱ Est: --'} | 
            ${op.tempoRealMinutos ? '<strong>Real: ' + formatDuration(op.tempoRealMinutos) + '</strong>' : 'Real: --'}
          </div>
        </div>
        <div style="display:flex; gap:0.5rem; align-items:center">
          ${getStatusBadge(op.estado || 'PENDENTE')}
          <button class="btn btn-secondary btn-sm" onclick="openOpModal(${op.id})">✏️ Editar</button>
          ${op.estado !== 'CONCLUIDA' ? `<button class="btn btn-success btn-sm" onclick="concluirOperacao(${op.id})">✅</button>` : ''}
        </div>
      </div>
    </div>
  `).join('');
}

function getChecklistKey() { return `sgo_checklist_${currentRepair?.id || 'generic'}`; }

function renderChecklist() {
  const saved = JSON.parse(localStorage.getItem(getChecklistKey()) || '{}');
  return CHECKLIST_ITEMS.map((item, i) => {
    const checked = saved[i] || false;
    return `
      <div class="checklist-item ${checked ? 'checked' : ''}" onclick="toggleChecklistItem(${i}, this)" style="padding: 0.5rem; border: 1px solid var(--border); border-radius: var(--radius); cursor: pointer; background: var(--card-bg);">
        <input type="checkbox" id="chk-${i}" ${checked ? 'checked' : ''} onchange="toggleChecklistItem(${i}, this.closest('.checklist-item'))" style="margin-right: 0.5rem;">
        <label for="chk-${i}" style="cursor: pointer;">${escapeHtml(item)}</label>
      </div>`;
  }).join('');
}

function toggleChecklistItem(index, itemEl) {
  const key = getChecklistKey();
  const saved = JSON.parse(localStorage.getItem(key) || '{}');
  saved[index] = !saved[index];
  localStorage.setItem(key, JSON.stringify(saved));
  if (itemEl) {
    itemEl.classList.toggle('checked', saved[index]);
    const chk = itemEl.querySelector('input[type="checkbox"]');
    if (chk) chk.checked = saved[index];
  }
}
function clearChecklist() {
  localStorage.removeItem(getChecklistKey());
  const cl = document.getElementById('checklist');
  if (cl) cl.innerHTML = renderChecklist();
}

async function openGestaoPecasModal() {
  if (!currentRepair) return;
  await loadPecas(''); 
  showModal('modal-gestao-pecas');
}

async function loadPecas(search) {
  try {
    allPecas = await api.getPecas(search) || [];
    renderPecasTable(allPecas);
  } catch (err) {
    document.getElementById('pecas-tbody').innerHTML = `<tr><td colspan="4" class="text-center text-muted">Erro ao carregar peças</td></tr>`;
  }
}

function filterPecas(search) {
  const filtered = search ? allPecas.filter(p => p.referencia?.toLowerCase().includes(search.toLowerCase()) || p.designacao?.toLowerCase().includes(search.toLowerCase())) : allPecas;
  renderPecasTable(filtered);
}

// MÁGICA 1: Tabela de Peças Inteligente (Com stock VS Sem stock)
function renderPecasTable(pecas) {
  const tbody = document.getElementById('pecas-tbody');
  if (!tbody) return;
  if (!pecas.length) { tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted" style="padding:1rem">Nenhuma peça encontrada</td></tr>`; return; }
  
  tbody.innerHTML = pecas.map(p => {
    const stockAtual = p.quantidadeStock ?? p.stockAtual ?? 0;
    const lowStock = stockAtual <= (p.stockMinimo ?? 0);
    const outOfStock = stockAtual <= 0;
    
    return `<tr>
      <td><code>${escapeHtml(p.referencia)}</code></td>
      <td>${escapeHtml(p.designacao)} ${lowStock ? '<span class="badge badge-danger">⚠️ Baixo</span>' : ''}</td>
      <td class="${lowStock ? 'stock-low' : 'stock-ok'}"><strong>${stockAtual}</strong></td>
      <td>
        ${!outOfStock 
            ? `<button class="btn btn-primary btn-sm" onclick="openRequisitar(${p.id}, '${escapeHtml(p.designacao)}', ${stockAtual})">➕ Usar</button>`
            : `<button class="btn btn-warning btn-sm" onclick="pedirEncomenda('${escapeHtml(p.designacao)}')">⚠️ Encomendar</button>`
        }
      </td>
    </tr>`;
  }).join('');
}

function openRequisitar(pecaId, designacao, stock) {
  hideModal('modal-gestao-pecas'); 
  pecaEmRequisicaoNome = designacao; // Guarda o nome para criar a operação a seguir
  document.getElementById('req-peca-id').value = pecaId;
  document.getElementById('req-peca-desc').textContent = `${designacao} (Stock Disponível: ${stock})`;
  document.getElementById('req-qty').value = 1;
  document.getElementById('req-qty').max = stock;
  document.getElementById('req-obs').value = '';
  showModal('modal-requisitar');
}

// MÁGICA 2: Quando a peça TEM stock, abate e cria tarefa!
async function submitRequisicao(e) {
  e.preventDefault();
  const pecaId = parseInt(document.getElementById('req-peca-id').value);
  const qty = parseInt(document.getElementById('req-qty').value);
  const obs = document.getElementById('req-obs').value.trim();
  
  if (!qty || qty < 1) return showToast('Quantidade inválida.', 'warning');
  
  try {
    // 1. Tira a peça do stock (Backend regista hora e dia automaticamente no MovimentoStockDao)
    await api.requisitarPeca(pecaId, { pecaId: pecaId, quantidade: qty, observacoes: obs || null, reparacaoId: currentRepair?.id });
    
    // 2. Cria a operação de instalação para o mecânico registar o tempo!
    await api.addOperacao(currentRepair.id, {
        descricao: `Instalação/Substituição: ${pecaEmRequisicaoNome} (${qty}x)`,
        tempoEstimadoMinutos: 30, // Estimativa base
        estado: 'PENDENTE'
    });

    showToast('Peça retirada e Operação de Instalação criada!', 'success');
    hideModal('modal-requisitar');
    
    // 3. Atualiza a vista com os novos materiais usados
    currentRepair = await api.getReparacao(currentRepair.id);
    renderDetailPanel();
    openTrabalhosModal(); // Abre logo os trabalhos para ele ligar o cronómetro nessa peça
    
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

// MÁGICA 3: Quando a peça NÃO TEM stock, alerta a oficina!
async function pedirEncomenda(designacaoPeca) {
    const ok = await confirmDialog(`A peça "${designacaoPeca}" está sem stock. Deseja alertar a receção e suspender o trabalho?`);
    if (!ok) return;

    try {
        // 1. Cria uma operação a avisar da falta da peça
        await api.addOperacao(currentRepair.id, {
            descricao: `Aguardar Encomenda: ${designacaoPeca}`,
            tempoEstimadoMinutos: 0,
            estado: 'PENDENTE'
        });

        // 2. Muda o estado do carro para AGUARDA_PECAS (O Admin vai ver no Dashboard)
        await api.updateEstadoReparacao(currentRepair.id, 'AGUARDA_PECAS');
        
        showToast('Aviso enviado! O carro está agora a Aguardar Peças.', 'warning');
        hideModal('modal-gestao-pecas');
        
        // 3. Tira o mecânico do carro
        backToDashboard(); 

    } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

/* ── Resto das Funções ── */
function openOpModal(opId) {
  document.getElementById('modal-op-title').textContent = opId ? 'Editar Operação' : 'Nova Operação';
  document.getElementById('form-op').reset();
  document.getElementById('op-id').value = opId || '';
  if (opId && currentRepair) {
    const op = (currentRepair.operacoes || []).find(o => o.id === opId);
    if (op) {
      document.getElementById('op-descricao').value = op.descricao || '';
      document.getElementById('op-tempo').value = op.tempoEstimadoMinutos || '';
      document.getElementById('op-estado').value = op.estado || 'PENDENTE';
      currentOpId = opId; 
      renderDetailPanel(); 
    }
  } else { currentOpId = null; }
  
  hideModal('modal-trabalhos');
  showModal('modal-op');
}

async function submitOperacao(e) {
  e.preventDefault();
  if (!currentRepair) return;
  const id = document.getElementById('op-id').value;
  const desc = document.getElementById('op-descricao').value.trim();
  const tempo = document.getElementById('op-tempo').value;
  const estado = document.getElementById('op-estado').value;
  const payload = { descricao: desc, tempoEstimadoMinutos: tempo ? parseInt(tempo) : null, estado: estado };
  try {
    if (id) await api.updateOperacao(currentRepair.id, id, payload);
    else await api.addOperacao(currentRepair.id, payload);
    showToast(id ? 'Atualizada!' : 'Adicionada!', 'success');
    hideModal('modal-op');
    currentRepair = await api.getReparacao(currentRepair.id);
    openTrabalhosModal(); 
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

async function concluirOperacao(opId) {
  if (!currentRepair) return;
  const op = (currentRepair.operacoes || []).find(o => o.id === opId);
  try {
    await api.updateOperacao(currentRepair.id, opId, { descricao: op.descricao, estado: 'CONCLUIDA' });
    showToast('Operação concluída!', 'success');
    currentRepair = await api.getReparacao(currentRepair.id);
    openTrabalhosModal(); 
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}

async function concluirReparacao() {
  if (!currentRepair) return;
  const pendentes = (currentRepair.operacoes || []).filter(o => o.estado !== 'CONCLUIDA');
  const ok = await confirmDialog(pendentes.length > 0 ? `Ainda tem ${pendentes.length} operações por concluir. Fechar a reparação na mesma?` : 'Confirma a conclusão total deste trabalho?');
  if (!ok) return;
  
  if (timerRunning) handleTimerClick(); 
  
  try {
    await api.updateEstadoReparacao(currentRepair.id, 'CONCLUIDA');
    showToast('Trabalho Concluído com Sucesso!', 'success');
    backToDashboard(); 
  } catch (err) { showToast('Erro: ' + err.message, 'error'); }
}