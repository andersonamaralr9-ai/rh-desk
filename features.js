// ============================================
// FEATURES v2 - Relatórios, Satisfação, 
// Aceite, Upload 5MB, Catálogo melhorado
// ============================================

// ============================================
// 1. LIMITE DE UPLOAD 5MB
// ============================================
var MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Sobrescrever handleFileSelect se existir
var _origHandleFileSelect = typeof handleFileSelect === 'function' ? handleFileSelect : null;
window.handleFileSelect = function(input) {
    var files = input.files;
    var valid = [];
    var rejected = [];
    for (var i = 0; i < files.length; i++) {
        if (files[i].size > MAX_FILE_SIZE) {
            rejected.push(files[i].name + ' (' + (files[i].size / 1024 / 1024).toFixed(1) + 'MB)');
        } else {
            valid.push(files[i]);
        }
    }
    if (rejected.length > 0) {
        showToast('Arquivo(s) excede(m) 5MB: ' + rejected.join(', '), 'error');
    }
    // Criar novo FileList com arquivos válidos
    var dt = new DataTransfer();
    valid.forEach(function(f) { dt.items.add(f); });
    input.files = dt.files;
    // Mostrar lista
    var listEl = document.getElementById('file-list');
    if (listEl) {
        listEl.innerHTML = '';
        valid.forEach(function(f) {
            listEl.innerHTML += '<div class="file-item"><i class="fas fa-paperclip"></i> ' +
                escapeHtml(f.name) + ' <span style="color:var(--gray-400)">(' +
                (f.size / 1024).toFixed(0) + 'KB)</span></div>';
        });
    }
};

// ============================================
// 2. FLUXO DE CONCLUSÃO + ACEITE (3 DIAS)
// ============================================

// Quando atendente marca como "resolvido", inicia prazo de 3 dias
// CORRIGIDO: resolveTicket — usar colunas reais
async function resolveTicket(ticketId) {
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket) return showToast('Chamado não encontrado', 'error');

    const now = new Date().toISOString();
    const deadline = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

    // Atualiza local primeiro
    ticket.status = 'resolvido';
    ticket.resolvedAt = now;
    ticket.acceptanceDeadline = deadline;
    ticket.updatedAt = now;
    if (!ticket.history) ticket.history = [];
    ticket.history.push({
        at: now,
        by: currentUser.id,
        action: 'Status: Resolvido',
        details: ''
    });

    // Atualiza Supabase
    try {
        await supaRest.update('tickets', ticketId, {
            status: 'resolvido',
            resolved_at: now,
            acceptance_deadline: deadline,
            updated_at: now,
            history: ticket.history
        });
    } catch(e) {
        console.error('Erro ao resolver ticket no Supabase:', e);
    }

    // Mensagem de sistema
    try {
        await db.addMessage({
            ticketId: ticketId,
            userId: currentUser.id,
            type: 'system',
            text: 'Status: Resolvido',
            attachments: []
        });
    } catch(e) {
        console.error('Erro ao adicionar mensagem:', e);
    }

    localStorage.setItem('rh_desk_tickets', JSON.stringify(db.tickets));
    showToast('Chamado resolvido! Aguardando aceite do solicitante (3 dias)', 'success');
    renderSidebar();
    if (typeof renderTicketDetail === 'function') renderTicketDetail(ticketId);
}


// CORRIGIDO: acceptResolution
async function acceptResolution(ticketId) {
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (!ticket) return showToast('Chamado não encontrado', 'error');

    const now = new Date().toISOString();

    ticket.status = 'fechado';
    ticket.closedAt = now;
    ticket.updatedAt = now;
    if (!ticket.history) ticket.history = [];
    ticket.history.push({
        at: now,
        by: currentUser.id,
        action: 'Resolução aceita - Chamado fechado',
        details: ''
    });

    try {
        await supaRest.update('tickets', ticketId, {
            status: 'fechado',
            closed_at: now,
            updated_at: now,
            history: ticket.history
        });
    } catch(e) {
        console.error('Erro ao aceitar resolução no Supabase:', e);
    }

    localStorage.setItem('rh_desk_tickets', JSON.stringify(db.tickets));
    showToast('Resolução aceita! Chamado fechado.', 'success');
    renderSidebar();

    // Mostra pesquisa de satisfação
    showSatisfactionSurvey(ticketId);
}

// CORRIGIDO: reopenTicket
async function reopenTicket(ticketId, reason) {
    var ticket = db.getTicketById(ticketId);
    if (!ticket) return;
    var now = new Date().toISOString();
    
    ticket.status = 'em-andamento';
    ticket.resolvedAt = null;
    ticket.acceptanceDeadline = null;
    ticket.updatedAt = now;
    if (!ticket.history) ticket.history = [];
    ticket.history.push({
        action: 'Chamado reaberto pelo usuario',
        by: currentUser.id,
        at: now,
        details: reason || 'Solucao nao atendeu'
    });
    
    try {
        await supaRest.update('tickets', 'id=eq.' + ticketId, {
            status: 'em-andamento',
            resolved_at: null,
            acceptance_deadline: null,
            updated_at: now,
            history: ticket.history
        });
    } catch(e) { console.error('Erro reopen:', e); }
    
    db.saveToLocal();
    showToast('Chamado reaberto!', 'warning');
    navigateTo('ticket-detail', { id: ticketId });
}

// CORRIGIDO: autoCloseExpiredTickets
async function autoCloseExpiredTickets() {
    var now = new Date();
    var resolved = db.data.tickets.filter(function(t) {
        return t.status === 'resolvido' && t.acceptanceDeadline;
    });
    for (var i = 0; i < resolved.length; i++) {
        var t = resolved[i];
        if (new Date(t.acceptanceDeadline) <= now) {
            t.status = 'fechado';
            t.closedAt = now.toISOString();
            t.updatedAt = now.toISOString();
            if (!t.history) t.history = [];
            t.history.push({
                action: 'Fechado automaticamente',
                by: 'SISTEMA',
                at: now.toISOString(),
                details: 'Prazo de 3 dias expirou sem contestacao'
            });
            try {
                await supaRest.update('tickets', 'id=eq.' + t.id, {
                    status: 'fechado',
                    closed_at: now.toISOString(),
                    updated_at: now.toISOString(),
                    history: t.history,
                    satisfaction_sent: false
                });
            } catch(e) {}
        }
    }
    db.saveToLocal();
}

// ============================================
// 3. PESQUISA DE SATISFAÇÃO
// ============================================
function showSatisfactionSurvey(ticketId) {
    window._selectedRating = 0;

    const modalHTML = `
        <div class="modal-overlay" id="satisfaction-modal" style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:9999;">
            <div style="background:white;border-radius:12px;padding:30px;max-width:450px;width:90%;text-align:center;">
                <h3 style="margin-bottom:5px;">Pesquisa de Satisfação</h3>
                <p style="color:#666;margin-bottom:5px;">Como foi seu atendimento?</p>
                <p style="color:#999;font-size:13px;">Chamado: ${ticketId}</p>

                <div class="satisfaction-stars" style="font-size:40px;cursor:pointer;margin:15px 0;">
                    <span class="star" data-value="1" onclick="selectRating(1)" onmouseover="hoverRating(1)" onmouseout="hoverRating(0)">★</span>
                    <span class="star" data-value="2" onclick="selectRating(2)" onmouseover="hoverRating(2)" onmouseout="hoverRating(0)">★</span>
                    <span class="star" data-value="3" onclick="selectRating(3)" onmouseover="hoverRating(3)" onmouseout="hoverRating(0)">★</span>
                    <span class="star" data-value="4" onclick="selectRating(4)" onmouseover="hoverRating(4)" onmouseout="hoverRating(0)">★</span>
                    <span class="star" data-value="5" onclick="selectRating(5)" onmouseover="hoverRating(5)" onmouseout="hoverRating(0)">★</span>
                </div>

                <p style="font-weight:bold;margin-bottom:8px;">Comentário (opcional)</p>
                <textarea id="satisfaction-comment" placeholder="Conte como foi sua experiência..." 
                    style="width:100%;height:80px;border:1px solid #ddd;border-radius:8px;padding:10px;resize:none;box-sizing:border-box;"></textarea>

                <div style="margin-top:20px;display:flex;gap:10px;justify-content:center;">
                    <button onclick="document.getElementById('satisfaction-modal').remove()" 
                        style="padding:10px 25px;border:1px solid #ddd;border-radius:8px;background:white;cursor:pointer;">Pular</button>
                    <button onclick="submitSurvey('${ticketId}')" 
                        style="padding:10px 25px;border:none;border-radius:8px;background:#3b82f6;color:white;cursor:pointer;">Enviar Avaliação</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function selectRating(value) {
    window._selectedRating = value;
    const stars = document.querySelectorAll('.satisfaction-stars .star');
    stars.forEach(s => {
        const v = parseInt(s.dataset.value);
        s.style.color = v <= value ? '#f59e0b' : '#d1d5db';
        if (v <= value) {
            s.classList.add('selected');
        } else {
            s.classList.remove('selected');
        }
    });
}

function hoverRating(value) {
    if (window._selectedRating) return; // Não hover se já selecionou
    const stars = document.querySelectorAll('.satisfaction-stars .star');
    stars.forEach(s => {
        const v = parseInt(s.dataset.value);
        s.style.color = v <= value ? '#f59e0b' : '#d1d5db';
    });
}


async function submitSurvey(ticketId) {
    const ratingEl = document.querySelector('.satisfaction-stars .star.selected:last-of-type') ||
                     document.querySelector('.star.active:last-of-type');

    // Busca a nota pela quantidade de estrelas selecionadas
    let rating = 0;
    const allStars = document.querySelectorAll('.satisfaction-stars .star, .stars-container .star');
    allStars.forEach(s => {
        if (s.classList.contains('selected') || s.classList.contains('active')) {
            const val = parseInt(s.dataset.value || s.dataset.rating || s.getAttribute('data-value'));
            if (val > rating) rating = val;
        }
    });

    // Fallback: tenta pegar do atributo global
    if (!rating) {
        rating = window._selectedRating || 0;
    }

    if (!rating || rating < 1) {
        return showToast('Selecione uma avaliação (1-5 estrelas)', 'error');
    }

    const commentEl = document.querySelector('#satisfaction-comment, .satisfaction-comment, textarea[name="comment"]');
    const comment = commentEl ? commentEl.value.trim() : '';

    const now = new Date().toISOString();
    const surveyId = 'SAT' + Date.now();

    // Insert na tabela satisfaction_surveys
    try {
        await supaRest.insert('satisfaction_surveys', {
            id: surveyId,
            ticket_id: ticketId,
            user_id: currentUser.id,
            rating: rating,
            comment: comment,
            created_at: now
        });
    } catch(e) {
        console.error('Erro ao salvar pesquisa de satisfação:', e);
        showToast('Erro ao enviar avaliação. Tente novamente.', 'error');
        return;
    }

    // Marca ticket como satisfaction_sent
    const ticket = db.tickets.find(t => t.id === ticketId);
    if (ticket) {
        ticket.satisfactionSent = true;
        try {
            await supaRest.update('tickets', ticketId, {
                satisfaction_sent: true
            });
        } catch(e) {
            console.error('Erro ao atualizar satisfaction_sent:', e);
        }
        localStorage.setItem('rh_desk_tickets', JSON.stringify(db.tickets));
    }

    // Fecha o modal
    const modal = document.querySelector('.modal-overlay, .modal, #satisfaction-modal');
    if (modal) modal.remove();

    showToast('Avaliação enviada com sucesso! Obrigado!', 'success');
    renderSidebar();
    if (typeof renderTicketDetail === 'function') renderTicketDetail(ticketId);
}


// ============================================
// 4. RELATÓRIOS (apenas admin)
// ============================================
function renderReports(container) {
    var tickets = db.data.tickets;
    var categories = db.data.catalog.categories || [];
    var analysts = db.data.users.filter(function(u) { return u.role === 'analyst' || u.role === 'admin'; });
    
    // Opções de filtro
    var catOptions = '<option value="">Todas</option>';
    categories.forEach(function(c) {
        catOptions += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
    });
    
    var analystOptions = '<option value="">Todos</option>';
    analysts.forEach(function(a) {
        analystOptions += '<option value="' + a.id + '">' + escapeHtml(a.name) + '</option>';
    });
    
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-chart-bar"></i> Relatorios</h2>' +
        '<button class="btn btn-success" onclick="exportReportCSV()"><i class="fas fa-file-excel"></i> Exportar Excel</button></div>' +
        
        // Filtros
        '<div class="card" style="margin-bottom:20px;"><div class="card-body">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;">' +
        '<div class="form-group" style="margin:0"><label style="font-size:12px">Status</label>' +
        '<select id="rpt-status" onchange="applyReportFilters()"><option value="">Todos</option>' +
        '<option value="aberto">Aberto</option><option value="em-andamento">Em Andamento</option>' +
        '<option value="pendente">Pendente</option><option value="resolvido">Resolvido</option>' +
        '<option value="fechado">Fechado</option><option value="cancelado">Cancelado</option></select></div>' +
        '<div class="form-group" style="margin:0"><label style="font-size:12px">Atendente</label>' +
        '<select id="rpt-analyst" onchange="applyReportFilters()">' + analystOptions + '</select></div>' +
        '<div class="form-group" style="margin:0"><label style="font-size:12px">Categoria</label>' +
        '<select id="rpt-category" onchange="applyReportFilters()">' + catOptions + '</select></div>' +
        '<div class="form-group" style="margin:0"><label style="font-size:12px">Prazo SLA</label>' +
        '<select id="rpt-sla" onchange="applyReportFilters()"><option value="">Todos</option>' +
        '<option value="dentro">Dentro do prazo</option><option value="fora">Fora do prazo</option></select></div>' +
        '<div class="form-group" style="margin:0"><label style="font-size:12px">Data inicio</label>' +
'<input type="text" id="rpt-date-from" placeholder="dd/mm/aaaa" maxlength="10" oninput="maskDate(this)" onchange="applyReportFilters()"></div>' +
'<div class="form-group" style="margin:0"><label style="font-size:12px">Data fim</label>' +
'<input type="text" id="rpt-date-to" placeholder="dd/mm/aaaa" maxlength="10" oninput="maskDate(this)" onchange="applyReportFilters()"></div>' +
        '</div></div></div>' +
        
        // Cards de resumo
        '<div id="rpt-summary" class="stats-grid" style="margin-bottom:20px;"></div>' +
        
        // Tabela
        '<div class="card"><div class="card-header"><h3 id="rpt-count">Chamados</h3></div>' +
        '<div class="card-body"><div id="rpt-table"></div></div></div>' +
        
        // Satisfação (só admin)
        (isAdmin() ? '<div class="card" style="margin-top:20px;" id="rpt-satisfaction-card"><div class="card-header"><h3><i class="fas fa-star" style="color:#f59e0b"></i> Pesquisa de Satisfacao</h3></div>' +
        '<div class="card-body" id="rpt-satisfaction">Carregando...</div></div>' : '');
    
    applyReportFilters();
    if (isAdmin()) loadSatisfactionReport();
}

function getFilteredTickets() {
    var tickets = db.data.tickets.slice();
    var status = document.getElementById('rpt-status') ? document.getElementById('rpt-status').value : '';
    var analyst = document.getElementById('rpt-analyst') ? document.getElementById('rpt-analyst').value : '';
    var category = document.getElementById('rpt-category') ? document.getElementById('rpt-category').value : '';
    var slaFilter = document.getElementById('rpt-sla') ? document.getElementById('rpt-sla').value : '';
    var dateFrom = document.getElementById('rpt-date-from') ? document.getElementById('rpt-date-from').value : '';
    var dateTo = document.getElementById('rpt-date-to') ? document.getElementById('rpt-date-to').value : '';
    
    if (status) tickets = tickets.filter(function(t) { return t.status === status; });
    if (analyst) tickets = tickets.filter(function(t) { return t.assignedTo === analyst; });
    if (category) tickets = tickets.filter(function(t) { return t.categoryId === category; });
    var isoFrom = parseBRDate(dateFrom);
var isoTo = parseBRDate(dateTo);
if (isoFrom) tickets = tickets.filter(function(t) { return t.createdAt >= isoFrom; });
if (isoTo) tickets = tickets.filter(function(t) { return t.createdAt <= isoTo + 'T23:59:59'; });
    if (slaFilter) {
        tickets = tickets.filter(function(t) {
            var slaStatus = db.getSLAStatus(t);
            if (slaFilter === 'dentro') return slaStatus.status === 'ok' || slaStatus.status === 'warning' || slaStatus.status === 'completed';
            if (slaFilter === 'fora') return slaStatus.status === 'danger';
            return true;
        });
    }
    
    tickets.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    return tickets;
}

function applyReportFilters() {
    var tickets = getFilteredTickets();
    
    // Summary cards
    var total = tickets.length;
    var open = tickets.filter(function(t) { return t.status === 'aberto'; }).length;
    var closed = tickets.filter(function(t) { return t.status === 'fechado'; }).length;
    var overdue = tickets.filter(function(t) { return db.getSLAStatus(t).status === 'danger'; }).length;
    var withinSLA = total > 0 ? Math.round(((total - overdue) / total) * 100) : 0;
    
    var avgTime = 0;
    var closedTickets = tickets.filter(function(t) { return t.closedAt && t.createdAt; });
    if (closedTickets.length > 0) {
        var totalHours = closedTickets.reduce(function(sum, t) {
            return sum + (new Date(t.closedAt) - new Date(t.createdAt)) / 3600000;
        }, 0);
        avgTime = Math.round(totalHours / closedTickets.length);
    }
    
    document.getElementById('rpt-summary').innerHTML =
        '<div class="stat-card"><div class="stat-icon blue"><i class="fas fa-list"></i></div><div class="stat-info"><h4>' + total + '</h4><p>Total</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-folder-open"></i></div><div class="stat-info"><h4>' + open + '</h4><p>Abertos</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon green"><i class="fas fa-check"></i></div><div class="stat-info"><h4>' + closed + '</h4><p>Fechados</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon red"><i class="fas fa-clock"></i></div><div class="stat-info"><h4>' + overdue + '</h4><p>Fora do prazo</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#ecfdf5;color:#059669"><i class="fas fa-percentage"></i></div><div class="stat-info"><h4>' + withinSLA + '%</h4><p>Dentro do SLA</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon" style="background:#eff6ff;color:#2563eb"><i class="fas fa-hourglass-half"></i></div><div class="stat-info"><h4>' + avgTime + 'h</h4><p>Tempo medio</p></div></div>';
    
    document.getElementById('rpt-count').textContent = total + ' chamado(s) encontrado(s)';
    
    // Table
    if (tickets.length === 0) {
        document.getElementById('rpt-table').innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><h3>Nenhum chamado com esses filtros</h3></div>';
        return;
    }
    
    var html = '<div class="table-wrapper"><table><thead><tr>' +
        '<th>No</th><th>Assunto</th><th>Categoria</th><th>Solicitante</th><th>Atendente</th>' +
        '<th>Status</th><th>SLA</th><th>Abertura</th><th>Fechamento</th></tr></thead><tbody>';
    
    tickets.forEach(function(t) {
        var cat = db.getCategoryById(t.categoryId);
        var user = db.getUserById(t.createdBy || t.userId);
        var analyst = t.assignedTo ? db.getUserById(t.assignedTo) : null;
        var sla = db.getSLAStatus(t);
        var slaLabel = sla.status === 'danger' ? '<span style="color:#dc2626;font-weight:600">FORA</span>' :
                       sla.status === 'completed' ? '<span style="color:#059669">OK</span>' :
                       '<span style="color:#2563eb">' + sla.text + '</span>';
        
        html += '<tr>' +
            '<td><strong style="color:var(--primary)">' + t.id + '</strong></td>' +
            '<td>' + escapeHtml(t.subject || t.title || '') + '</td>' +
            '<td>' + (cat ? escapeHtml(cat.name) : 'N/A') + '</td>' +
            '<td>' + (user ? escapeHtml(user.name) : 'N/A') + '</td>' +
            '<td>' + (analyst ? escapeHtml(analyst.name) : '<span style="color:var(--gray-400)">Nao atribuido</span>') + '</td>' +
            '<td><span class="status-badge status-' + t.status + '">' + formatStatus(t.status) + '</span></td>' +
            '<td>' + slaLabel + '</td>' +
            '<td style="font-size:12px">' + formatDate(t.createdAt) + '</td>' +
            '<td style="font-size:12px">' + (t.closedAt ? formatDate(t.closedAt) : '-') + '</td></tr>';
    });
    
    document.getElementById('rpt-table').innerHTML = html + '</tbody></table></div>';
}

function exportReportCSV() {
    var tickets = getFilteredTickets();
    if (tickets.length === 0) { showToast('Nenhum dado para exportar', 'warning'); return; }

    if (typeof XLSX === 'undefined') {
        showToast('Biblioteca Excel nao carregada. Tente novamente.', 'error');
        return;
    }

    // === ABA 1: CHAMADOS ===
    var chamadosData = [
        ['No', 'Assunto', 'Categoria', 'Solicitante', 'Atendente', 'Status', 'Prioridade', 'SLA', 'Abertura', 'Fechamento', 'Tempo (horas)']
    ];
    tickets.forEach(function(t) {
        var cat = db.getCategoryById(t.categoryId);
        var user = db.getUserById(t.createdBy || t.userId);
        var analyst = t.assignedTo ? db.getUserById(t.assignedTo) : null;
        var sla = db.getSLAStatus(t);
        var hours = t.closedAt && t.createdAt ? Math.round((new Date(t.closedAt) - new Date(t.createdAt)) / 3600000) : '';
        chamadosData.push([
            t.id,
            t.subject || t.title || '',
            cat ? cat.name : 'N/A',
            user ? user.name : 'N/A',
            analyst ? analyst.name : 'Nao atribuido',
            formatStatus(t.status),
            t.priority || 'media',
            sla.status === 'danger' ? 'FORA DO PRAZO' : 'DENTRO DO PRAZO',
            t.createdAt ? new Date(t.createdAt).toLocaleString('pt-BR') : '',
            t.closedAt ? new Date(t.closedAt).toLocaleString('pt-BR') : '',
            hours
        ]);
    });

    var wb = XLSX.utils.book_new();
    var ws1 = XLSX.utils.aoa_to_sheet(chamadosData);

    // Largura das colunas
    ws1['!cols'] = [
        { wch: 18 }, { wch: 35 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
        { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 12 }
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Chamados');

    // === ABA 2: RESUMO ===
    var total = tickets.length;
    var abertos = tickets.filter(function(t) { return t.status === 'aberto'; }).length;
    var emAndamento = tickets.filter(function(t) { return t.status === 'em-andamento'; }).length;
    var pendentes = tickets.filter(function(t) { return t.status === 'pendente'; }).length;
    var resolvidos = tickets.filter(function(t) { return t.status === 'resolvido'; }).length;
    var fechados = tickets.filter(function(t) { return t.status === 'fechado'; }).length;
    var cancelados = tickets.filter(function(t) { return t.status === 'cancelado'; }).length;
    var foraSLA = tickets.filter(function(t) { return db.getSLAStatus(t).status === 'danger'; }).length;
    var dentroSLA = total - foraSLA;
    var pctSLA = total > 0 ? Math.round((dentroSLA / total) * 100) + '%' : 'N/A';

    var closedT = tickets.filter(function(t) { return t.closedAt && t.createdAt; });
    var avgHours = 0;
    if (closedT.length > 0) {
        avgHours = Math.round(closedT.reduce(function(s, t) {
            return s + (new Date(t.closedAt) - new Date(t.createdAt)) / 3600000;
        }, 0) / closedT.length);
    }

    var resumoData = [
        ['RELATORIO DE CHAMADOS - RH DESK'],
        ['Gerado em', new Date().toLocaleString('pt-BR')],
        [],
        ['INDICADOR', 'VALOR'],
        ['Total de chamados', total],
        ['Abertos', abertos],
        ['Em andamento', emAndamento],
        ['Pendentes', pendentes],
        ['Resolvidos', resolvidos],
        ['Fechados', fechados],
        ['Cancelados', cancelados],
        [],
        ['DESEMPENHO SLA', ''],
        ['Dentro do prazo', dentroSLA],
        ['Fora do prazo', foraSLA],
        ['% Dentro do SLA', pctSLA],
        ['Tempo medio resolucao', avgHours + ' horas']
    ];

    var ws2 = XLSX.utils.aoa_to_sheet(resumoData);
    ws2['!cols'] = [{ wch: 28 }, { wch: 22 }];
    // Merge titulo
    ws2['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumo');

    // === ABA 3: POR CATEGORIA ===
    var catMap = {};
    tickets.forEach(function(t) {
        var cat = db.getCategoryById(t.categoryId);
        var catName = cat ? cat.name : 'Sem categoria';
        if (!catMap[catName]) catMap[catName] = { total: 0, abertos: 0, fechados: 0, foraSLA: 0 };
        catMap[catName].total++;
        if (t.status === 'aberto') catMap[catName].abertos++;
        if (t.status === 'fechado') catMap[catName].fechados++;
        if (db.getSLAStatus(t).status === 'danger') catMap[catName].foraSLA++;
    });

    var catData = [['Categoria', 'Total', 'Abertos', 'Fechados', 'Fora do SLA']];
    Object.keys(catMap).forEach(function(name) {
        var c = catMap[name];
        catData.push([name, c.total, c.abertos, c.fechados, c.foraSLA]);
    });

    var ws3 = XLSX.utils.aoa_to_sheet(catData);
    ws3['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws3, 'Por Categoria');

    // === ABA 4: POR ATENDENTE ===
    var analystMap = {};
    tickets.forEach(function(t) {
        var analyst = t.assignedTo ? db.getUserById(t.assignedTo) : null;
        var aName = analyst ? analyst.name : 'Nao atribuido';
        if (!analystMap[aName]) analystMap[aName] = { total: 0, abertos: 0, fechados: 0, foraSLA: 0 };
        analystMap[aName].total++;
        if (t.status === 'aberto') analystMap[aName].abertos++;
        if (t.status === 'fechado') analystMap[aName].fechados++;
        if (db.getSLAStatus(t).status === 'danger') analystMap[aName].foraSLA++;
    });

    var analystData = [['Atendente', 'Total', 'Abertos', 'Fechados', 'Fora do SLA']];
    Object.keys(analystMap).forEach(function(name) {
        var a = analystMap[name];
        analystData.push([name, a.total, a.abertos, a.fechados, a.foraSLA]);
    });

    var ws4 = XLSX.utils.aoa_to_sheet(analystData);
    ws4['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'Por Atendente');

    // === GERAR ARQUIVO ===
    var fileName = 'relatorio_chamados_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    XLSX.writeFile(wb, fileName);
    showToast('Relatorio Excel exportado!', 'success');
}

// Relatório de satisfação (só admin)
async function loadSatisfactionReport() {
    var el = document.getElementById('rpt-satisfaction');
    if (!el) return;
    
    try {
        var surveys = await supaRest.select('satisfaction_surveys', 'select=*&order=created_at.desc');
        if (!surveys || surveys.length === 0) {
            el.innerHTML = '<div class="empty-state"><i class="fas fa-star"></i><h3>Nenhuma avaliacao registrada</h3></div>';
            return;
        }
        
        // Calcular médias
        var total = surveys.length;
        var avgRating = (surveys.reduce(function(s, r) { return s + r.rating; }, 0) / total).toFixed(1);
        var ratings = [0, 0, 0, 0, 0];
        surveys.forEach(function(s) { ratings[s.rating - 1]++; });
        
        var html = '<div style="display:grid;grid-template-columns:1fr 2fr;gap:24px;">' +
            // Resumo
            '<div style="text-align:center;padding:20px;">' +
            '<div style="font-size:48px;font-weight:700;color:#f59e0b;">' + avgRating + '</div>' +
            '<div style="margin:8px 0;">';
        for (var i = 0; i < 5; i++) {
            html += '<i class="fas fa-star" style="color:' + (i < Math.round(avgRating) ? '#f59e0b' : '#d1d5db') + ';font-size:20px;"></i>';
        }
        html += '</div><div style="color:var(--gray-500)">' + total + ' avaliacoes</div></div>' +
            // Barras
            '<div>';
        for (var r = 5; r >= 1; r--) {
            var pct = total > 0 ? Math.round((ratings[r - 1] / total) * 100) : 0;
            html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
                '<span style="width:20px;text-align:right;font-size:13px;">' + r + '</span>' +
                '<i class="fas fa-star" style="color:#f59e0b;font-size:12px;"></i>' +
                '<div style="flex:1;background:#e5e7eb;border-radius:4px;height:20px;overflow:hidden;">' +
                '<div style="width:' + pct + '%;height:100%;background:#f59e0b;border-radius:4px;transition:width 0.3s;"></div></div>' +
                '<span style="width:40px;font-size:12px;color:var(--gray-500)">' + ratings[r - 1] + ' (' + pct + '%)</span></div>';
        }
        html += '</div></div>';
        
        // Últimos comentários
        var withComments = surveys.filter(function(s) { return s.comment && s.comment.trim(); });
        if (withComments.length > 0) {
            html += '<div style="margin-top:24px;border-top:1px solid var(--gray-200);padding-top:16px;">' +
                '<h4 style="margin-bottom:12px;">Ultimos comentarios</h4>';
            withComments.slice(0, 10).forEach(function(s) {
                var user = db.getUserById(s.user_id);
                var stars = '';
                for (var i = 0; i < 5; i++) stars += '<i class="fas fa-star" style="color:' + (i < s.rating ? '#f59e0b' : '#d1d5db') + ';font-size:11px;"></i>';
                html += '<div style="background:var(--gray-50);padding:12px;border-radius:8px;margin-bottom:8px;">' +
                    '<div style="display:flex;justify-content:space-between;margin-bottom:4px;">' +
                    '<strong style="font-size:13px;">' + (user ? escapeHtml(user.name) : 'Usuario') + '</strong>' +
                    '<span>' + stars + '</span></div>' +
                    '<div style="font-size:13px;color:var(--gray-600);">' + escapeHtml(s.comment) + '</div>' +
                    '<div style="font-size:11px;color:var(--gray-400);margin-top:4px;">Chamado: ' + s.ticket_id + ' | ' + formatDate(s.created_at) + '</div></div>';
            });
            html += '</div>';
        }
        
        el.innerHTML = html;
    } catch(e) {
        console.error('Erro satisfaction report:', e);
        el.innerHTML = '<div style="color:#dc2626"><i class="fas fa-times-circle"></i> Erro ao carregar avaliacoes</div>';
    }
}

// ============================================
// 5. CATÁLOGO: ATIVAR/DESATIVAR + TRANSFERIR
// ============================================

// Sobrescrever renderAdminCatalogEdit para adicionar opções
var _origRenderAdminCatalogEdit = typeof renderAdminCatalogEdit === 'function' ? renderAdminCatalogEdit : null;
renderAdminCatalogEdit = function(container, categoryId) {
    var cat = db.getCategoryById(categoryId);
    if (!cat) { navigateTo('admin-catalog'); return; }
    
    var allCategories = db.data.catalog.categories || [];
    var transferOptions = '';
    allCategories.forEach(function(c) {
        if (c.id !== categoryId) {
            transferOptions += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
        }
    });
    
    var html = '<div class="back-link" onclick="navigateTo(\'admin-catalog\')"><i class="fas fa-arrow-left"></i> Voltar</div>' +
        '<div class="page-header"><h2><i class="fas ' + cat.icon + '" style="color:' + cat.color + '"></i> ' + escapeHtml(cat.name) + '</h2>' +
        '<div style="display:flex;gap:8px;">' +
        '<button class="btn ' + (cat.active !== false ? 'btn-warning' : 'btn-success') + '" onclick="toggleCategoryStatus(\'' + cat.id + '\')">' +
        '<i class="fas ' + (cat.active !== false ? 'fa-eye-slash' : 'fa-eye') + '"></i> ' + (cat.active !== false ? 'Desativar Categoria' : 'Ativar Categoria') + '</button>' +
        '<button class="btn btn-primary" onclick="showAddServiceModal(\'' + cat.id + '\')"><i class="fas fa-plus"></i> Novo Servico</button>' +
        '</div></div>';
    
    // Status da categoria
    if (cat.active === false) {
        html += '<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px;margin-bottom:16px;color:#92400e;">' +
            '<i class="fas fa-exclamation-triangle"></i> Esta categoria esta <strong>desativada</strong> e nao aparece para os usuarios.</div>';
    }
    
    html += '<div class="card"><div class="card-header"><h3>Servicos (' + (cat.services ? cat.services.length : 0) + ')</h3></div><div class="card-body">';
    
    if (!cat.services || cat.services.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>Nenhum servico</h3></div>';
    } else {
        html += '<div class="table-wrapper"><table><thead><tr><th>Servico</th><th>Descricao</th><th>SLA</th><th>Status</th><th>Acoes</th></tr></thead><tbody>';
        cat.services.forEach(function(srv) {
            var sla = db.getSLAById(srv.slaId);
            html += '<tr style="' + (srv.active === false ? 'opacity:0.5;' : '') + '">' +
                '<td><strong>' + escapeHtml(srv.name) + '</strong></td>' +
                '<td style="font-size:13px">' + escapeHtml(srv.description || '') + '</td>' +
                '<td>' + (sla ? sla.name + ' (' + sla.hours + 'h)' : 'N/A') + '</td>' +
                '<td><span class="status-badge ' + (srv.active !== false ? 'status-aberto' : 'status-cancelado') + '">' +
                (srv.active !== false ? 'Ativo' : 'Inativo') + '</span></td>' +
                '<td><div style="display:flex;gap:4px;flex-wrap:wrap;">' +
                '<button class="btn btn-sm ' + (srv.active !== false ? 'btn-warning' : 'btn-success') + '" onclick="toggleServiceStatus(\'' + cat.id + '\',\'' + srv.id + '\')" title="' + (srv.active !== false ? 'Desativar' : 'Ativar') + '">' +
                '<i class="fas ' + (srv.active !== false ? 'fa-eye-slash' : 'fa-eye') + '"></i></button>' +
                '<button class="btn btn-sm btn-secondary" onclick="showTransferServiceModal(\'' + cat.id + '\',\'' + srv.id + '\')" title="Transferir">' +
                '<i class="fas fa-exchange-alt"></i></button>' +
                '<button class="btn btn-sm btn-danger" onclick="confirmDeleteService(\'' + cat.id + '\',\'' + srv.id + '\')" title="Excluir">' +
                '<i class="fas fa-trash"></i></button>' +
                '</div></td></tr>';
        });
        html += '</tbody></table></div>';
    }
    
    container.innerHTML = html + '</div></div>';
};

// Toggle ativar/desativar categoria
async function toggleCategoryStatus(catId) {
    var cat = db.data.catalog.categories.find(function(c) { return c.id === catId; });
    if (!cat) return;
    cat.active = cat.active === false ? true : false;
    try { await saveCatalogToSupabase(); } catch(e) {}
    db.saveToLocal();
    showToast(cat.active ? 'Categoria ativada!' : 'Categoria desativada!', cat.active ? 'success' : 'warning');
    navigateTo('admin-catalog-edit', { categoryId: catId });
}

// Toggle ativar/desativar serviço
async function toggleServiceStatus(catId, srvId) {
    var cat = db.data.catalog.categories.find(function(c) { return c.id === catId; });
    if (!cat) return;
    var srv = cat.services.find(function(s) { return s.id === srvId; });
    if (!srv) return;
    srv.active = srv.active === false ? true : false;
    try { await saveCatalogToSupabase(); } catch(e) {}
    db.saveToLocal();
    showToast(srv.active ? 'Servico ativado!' : 'Servico desativado!', srv.active ? 'success' : 'warning');
    navigateTo('admin-catalog-edit', { categoryId: catId });
}

// Modal de transferência de serviço
function showTransferServiceModal(fromCatId, srvId) {
    var fromCat = db.data.catalog.categories.find(function(c) { return c.id === fromCatId; });
    if (!fromCat) return;
    var srv = fromCat.services.find(function(s) { return s.id === srvId; });
    if (!srv) return;
    
    var options = '';
    db.data.catalog.categories.forEach(function(c) {
        if (c.id !== fromCatId) {
            options += '<option value="' + c.id + '">' + escapeHtml(c.name) + '</option>';
        }
    });
    
    if (!options) {
        showToast('Nao existem outras categorias para transferir', 'warning');
        return;
    }
    
    var bodyHtml = '<div style="margin-bottom:16px;">' +
        '<p>Transferir <strong>' + escapeHtml(srv.name) + '</strong></p>' +
        '<p style="color:var(--gray-500);font-size:13px;">De: ' + escapeHtml(fromCat.name) + '</p></div>' +
        '<div class="form-group"><label>Transferir para:</label>' +
        '<select id="transfer-target">' + options + '</select></div>';
    
    var footerHtml = '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-primary" onclick="executeTransferService(\'' + fromCatId + '\',\'' + srvId + '\')"><i class="fas fa-exchange-alt"></i> Transferir</button>';
    
    openModal('Transferir Servico', bodyHtml, footerHtml);
}

async function executeTransferService(fromCatId, srvId) {
    var toCatId = document.getElementById('transfer-target').value;
    if (!toCatId) { showToast('Selecione a categoria destino', 'error'); return; }
    
    var fromCat = db.data.catalog.categories.find(function(c) { return c.id === fromCatId; });
    var toCat = db.data.catalog.categories.find(function(c) { return c.id === toCatId; });
    if (!fromCat || !toCat) return;
    
    var srvIdx = fromCat.services.findIndex(function(s) { return s.id === srvId; });
    if (srvIdx < 0) return;
    
    var srv = fromCat.services.splice(srvIdx, 1)[0];
    if (!toCat.services) toCat.services = [];
    toCat.services.push(srv);
    
    try { await saveCatalogToSupabase(); } catch(e) {}
    db.saveToLocal();
    
    closeModal();
    showToast('Servico transferido para ' + toCat.name + '!', 'success');
    navigateTo('admin-catalog-edit', { categoryId: fromCatId });
}

function confirmDeleteService(catId, srvId) {
    var cat = db.data.catalog.categories.find(function(c) { return c.id === catId; });
    if (!cat) return;
    var srv = cat.services.find(function(s) { return s.id === srvId; });
    if (!srv) return;
    
    if (confirm('Tem certeza que deseja excluir o servico "' + srv.name + '"?')) {
        cat.services = cat.services.filter(function(s) { return s.id !== srvId; });
        saveCatalogToSupabase().catch(function(e) {});
        db.saveToLocal();
        showToast('Servico excluido!', 'info');
        navigateTo('admin-catalog-edit', { categoryId: catId });
    }
}

// ============================================
// 6. INJETAR MENU DE RELATÓRIOS NO SIDEBAR
// ============================================
var _origBuildSidebar = buildSidebar;
buildSidebar = function() {
    _origBuildSidebar();
    if (isAdmin()) {
        var nav = document.getElementById('sidebar-nav');
        // Inserir antes de Configurações
        var settingsItem = nav.querySelector('[data-page="admin-settings"]');
        if (settingsItem) {
            var reportItem = document.createElement('div');
            reportItem.className = 'nav-item';
            reportItem.setAttribute('onclick', "navigateTo('reports')");
            reportItem.setAttribute('data-page', 'reports');
            reportItem.innerHTML = '<i class="fas fa-chart-bar"></i><span>Relatorios</span>';
            settingsItem.parentNode.insertBefore(reportItem, settingsItem);
        }
    }
};

// Adicionar rota de relatórios no navigateTo
var _origNavigateTo = navigateTo;
navigateTo = function(page, params) {
    if (page === 'reports') {
        params = params || {};
        document.querySelectorAll('#sidebar-nav .nav-item').forEach(function(item) {
            item.classList.remove('active');
            if (item.dataset.page === page) item.classList.add('active');
        });
        renderReports(document.getElementById('content'));
        return;
    }
    _origNavigateTo(page, params);
};

// ============================================
// 7. INJETAR BOTÕES DE ACEITE NO TICKET-DETAIL
// ============================================
// Sobrescrever para adicionar botões de aceite/reabrir quando status = resolvido
var _origRenderTicketDetail = typeof renderTicketDetail === 'function' ? renderTicketDetail : null;

// Hook no navigateTo para interceptar ticket-detail e adicionar botões
document.addEventListener('click', function(e) {
    // Após renderizar ticket-detail, adicionar botões de aceite
    setTimeout(function() {
        var content = document.getElementById('content');
        if (!content) return;
        var ticketHeader = content.querySelector('.page-header h2');
        if (!ticketHeader) return;
        var ticketId = ticketHeader.textContent.trim();
        if (!ticketId.startsWith('CHM-')) return;
        
        var ticket = db.getTicketById(ticketId);
        if (!ticket) return;
        
        // Se resolvido e é o usuario dono do chamado
        if (ticket.status === 'resolvido' && currentUser &&
            (currentUser.id === ticket.createdBy || currentUser.id === ticket.userId)) {
            
            var existingBar = document.getElementById('acceptance-bar');
            if (existingBar) return; // já injetado
            
            var deadline = ticket.acceptanceDeadline ? new Date(ticket.acceptanceDeadline) : null;
            var deadlineText = deadline ? formatDate(ticket.acceptanceDeadline) : 'N/A';
            
            var bar = document.createElement('div');
            bar.id = 'acceptance-bar';
            bar.style.cssText = 'background:#eff6ff;border:1px solid #3b82f6;border-radius:8px;padding:16px;margin-bottom:20px;';
            bar.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">' +
                '<div><i class="fas fa-info-circle" style="color:#3b82f6"></i> ' +
                '<strong>Este chamado foi resolvido.</strong> Voce tem ate <strong>' + deadlineText + '</strong> para aceitar ou reabrir.' +
                '</div><div style="display:flex;gap:8px;">' +
                '<button class="btn btn-success" onclick="acceptResolution(\'' + ticketId + '\')"><i class="fas fa-check"></i> Aceitar</button>' +
                '<button class="btn btn-warning" onclick="showReopenModal(\'' + ticketId + '\')"><i class="fas fa-undo"></i> Reabrir</button>' +
                '</div></div>';
            
            var cardBody = content.querySelector('.card-body');
            if (cardBody) cardBody.parentNode.insertBefore(bar, cardBody.parentNode.firstChild.nextSibling);
        }
    }, 200);
});

function showReopenModal(ticketId) {
    var bodyHtml = '<div class="form-group"><label>Por que deseja reabrir?</label>' +
        '<textarea id="reopen-reason" rows="3" placeholder="Descreva o motivo..." required></textarea></div>';
    var footerHtml = '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-warning" onclick="doReopen(\'' + ticketId + '\')"><i class="fas fa-undo"></i> Confirmar Reabertura</button>';
    openModal('Reabrir Chamado', bodyHtml, footerHtml);
}

function doReopen(ticketId) {
    var reason = document.getElementById('reopen-reason').value.trim();
    if (!reason) { showToast('Informe o motivo', 'warning'); return; }
    closeModal();
    reopenTicket(ticketId, reason);
}
// Máscara dd/mm/aaaa
function maskDate(input) {
    var v = input.value.replace(/\D/g, '');
    if (v.length > 2) v = v.substring(0, 2) + '/' + v.substring(2);
    if (v.length > 5) v = v.substring(0, 5) + '/' + v.substring(5, 9);
    input.value = v;
    if (v.length === 10) applyReportFilters();
}

// Converter dd/mm/aaaa para aaaa-mm-dd (ISO)
function parseBRDate(str) {
    if (!str || str.length !== 10) return '';
    var parts = str.split('/');
    if (parts.length !== 3) return '';
    return parts[2] + '-' + parts[1] + '-' + parts[0];
}

// ============================================
// 8. BOTÃO "ATRIBUIR A MIM" NO TICKET DETAIL
// ============================================
async function assignToMe(ticketId) {
    var ticket = db.getTicketById(ticketId);
    if (!ticket) return;
    
    ticket.assignedTo = currentUser.id;
    ticket.updatedAt = new Date().toISOString();
    if (ticket.status === 'aberto') ticket.status = 'em-andamento';
    if (!ticket.history) ticket.history = [];
    ticket.history.push({
        action: 'Chamado atribuido',
        by: currentUser.id,
        at: new Date().toISOString(),
        details: 'Atribuido a ' + currentUser.name
    });
    
    try {
        await supaRest.update('tickets', 'id=eq.' + ticketId, {
            assigned_to: currentUser.id,
            status: ticket.status,
            updated_at: ticket.updatedAt,
            history: ticket.history
        });
    } catch(e) { console.error('Erro assignToMe:', e); }
    
    db.saveToLocal();
    showToast('Chamado atribuido a voce!', 'success');
    buildSidebar();
    navigateTo('ticket-detail', { id: ticketId });
}

// Injetar botão "Atribuir a mim" na tela de detalhes do ticket
var _checkInjectAssignBtn = setInterval(function() {
    var content = document.getElementById('content');
    if (!content) return;
    
    // Detectar se estamos na tela de ticket-detail
    var header = content.querySelector('.page-header');
    if (!header) return;
    var headerText = header.textContent || '';
    if (headerText.indexOf('CHM-') < 0) return;
    
    // Extrair o ticket ID
    var ticketIdMatch = headerText.match(/(CHM-\d{4}-\d{5})/);
    if (!ticketIdMatch) return;
    var ticketId = ticketIdMatch[1];
    var ticket = db.getTicketById(ticketId);
    if (!ticket) return;
    
    // Só mostrar se é analista/admin E não está atribuído a ele E não está fechado/cancelado
    if (!isAnalyst()) return;
    if (ticket.assignedTo === currentUser.id) return;
    if (ticket.status === 'fechado' || ticket.status === 'cancelado') return;
    
    // Verificar se já injetou
    if (document.getElementById('btn-assign-me')) return;
    
    // Encontrar a área de botões no header
    var btnArea = header.querySelector('div');
    if (!btnArea) {
        // Criar área de botões se não existe
        btnArea = document.createElement('div');
        btnArea.style.cssText = 'display:flex;gap:8px;';
        header.appendChild(btnArea);
    }
    
    // Inserir botão "Atribuir a mim" ANTES dos outros botões
    var assignBtn = document.createElement('button');
    assignBtn.id = 'btn-assign-me';
    assignBtn.className = 'btn btn-primary';
    assignBtn.innerHTML = '<i class="fas fa-hand-point-up"></i> Atribuir a mim';
    assignBtn.onclick = function() { assignToMe(ticketId); };
    btnArea.insertBefore(assignBtn, btnArea.firstChild);
    
}, 500);

// ============================================
// 9. CATEGORIAS VISÍVEIS POR USUÁRIO
// ============================================

// Sobrescrever renderAdminUsers para adicionar coluna de categorias
var _origRenderAdminUsers2 = typeof renderAdminUsers === 'function' ? renderAdminUsers : null;
var _alreadyOverrodeAdminUsers = false;

// Função para abrir modal de editar categorias do usuário
function showUserCategoriesModal(userId) {
    var user = db.getUserById(userId);
    if (!user) return;
    
    var categories = db.data.catalog.categories || [];
    var allowed = user.allowedCategories || [];
    var isAll = !allowed || allowed.length === 0; // vazio = todas
    
    var bodyHtml = '<div style="margin-bottom:16px;">' +
        '<p>Selecione quais categorias <strong>' + escapeHtml(user.name) + '</strong> pode ver ao abrir chamados.</p>' +
        '<p style="font-size:13px;color:var(--gray-500);">Se nenhuma for marcada, o usuario vera TODAS as categorias.</p></div>' +
        '<div class="form-group"><label><input type="checkbox" id="cat-select-all" ' + (isAll ? 'checked' : '') + ' onchange="toggleAllCategories(this)"> <strong>Todas as categorias</strong></label></div>' +
        '<div id="cat-checkboxes" style="' + (isAll ? 'opacity:0.5;pointer-events:none;' : '') + 'max-height:300px;overflow-y:auto;padding:8px 0;">';
    
    categories.forEach(function(cat) {
        var checked = isAll || allowed.indexOf(cat.id) >= 0;
        bodyHtml += '<div style="padding:6px 0;border-bottom:1px solid var(--gray-100);">' +
            '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;">' +
            '<input type="checkbox" class="cat-check" value="' + cat.id + '" ' + (checked ? 'checked' : '') + '>' +
            '<i class="fas ' + cat.icon + '" style="color:' + cat.color + ';width:20px;text-align:center;"></i>' +
            '<span>' + escapeHtml(cat.name) + '</span>' +
            '</label></div>';
    });
    bodyHtml += '</div>';
    
    var footerHtml = '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-primary" onclick="saveUserCategories(\'' + userId + '\')"><i class="fas fa-save"></i> Salvar</button>';
    
    openModal('Categorias Visiveis - ' + user.name, bodyHtml, footerHtml);
}

function toggleAllCategories(checkbox) {
    var container = document.getElementById('cat-checkboxes');
    if (checkbox.checked) {
        container.style.opacity = '0.5';
        container.style.pointerEvents = 'none';
        document.querySelectorAll('.cat-check').forEach(function(cb) { cb.checked = true; });
    } else {
        container.style.opacity = '1';
        container.style.pointerEvents = 'auto';
    }
}

async function saveUserCategories(userId) {
    var isAll = document.getElementById('cat-select-all').checked;
    var allowed = [];
    
    if (!isAll) {
        document.querySelectorAll('.cat-check:checked').forEach(function(cb) {
            allowed.push(cb.value);
        });
    }
    // allowed vazio = todas
    
    var user = db.data.users.find(function(u) { return u.id === userId; });
    if (user) {
        user.allowedCategories = allowed;
    }
    
    try {
        await supaRest.update('users', 'id=eq.' + userId, {
            allowed_categories: allowed
        });
    } catch(e) {
        console.error('Erro salvar categorias usuario:', e);
    }
    
    db.saveToLocal();
    closeModal();
    showToast('Categorias atualizadas para ' + (user ? user.name : userId) + '!', 'success');
    navigateTo('admin-users');
}

// Sobrescrever renderNewTicket para filtrar categorias pelo usuario logado
var _origRenderNewTicket = renderNewTicket;
renderNewTicket = function(container) {
    var allowed = currentUser.allowedCategories || [];
    var categories;
    
    if (allowed.length === 0) {
        // Sem restrição — mostra todas ativas
        categories = db.getCategories();
    } else {
        // Filtra só as permitidas E ativas
        categories = db.getCategories().filter(function(cat) {
            return allowed.indexOf(cat.id) >= 0;
        });
    }
    
    var html = '<div class="page-header"><h2><i class="fas fa-plus-circle"></i> Abrir Chamado</h2></div>' +
        '<p style="color:var(--gray-500);margin-bottom:24px;">Selecione a categoria:</p><div class="catalog-grid">';
    
    categories.forEach(function(cat) {
        var activeServices = cat.services.filter(function(s) { return s.active !== false; });
        html += '<div class="catalog-card" onclick="navigateTo(\'catalog-services\',{categoryId:\'' + cat.id + '\'})">' +
            '<div class="catalog-card-icon" style="background:' + cat.color + '15;color:' + cat.color + '"><i class="fas ' + cat.icon + '"></i></div>' +
            '<h3>' + escapeHtml(cat.name) + '</h3><p>' + escapeHtml(cat.description) + '</p>' +
            '<div class="service-count">' + activeServices.length + ' servico(s)</div></div>';
    });
    
    if (categories.length === 0) {
        html += '<div class="empty-state"><i class="fas fa-folder-open"></i><h3>Nenhuma categoria disponivel</h3><p>Contate o administrador.</p></div>';
    }
    
    container.innerHTML = html + '</div>';
};

// Injetar botão de categorias na lista de usuários admin
var _checkInjectCatBtn = setInterval(function() {
    var content = document.getElementById('content');
    if (!content) return;
    if (!isAdmin()) return;
    
    // Detectar tabela de usuários
    var tables = content.querySelectorAll('table');
    if (tables.length === 0) return;
    
    tables.forEach(function(table) {
        var rows = table.querySelectorAll('tbody tr');
        rows.forEach(function(row) {
            // Verificar se já tem botão de categorias
            if (row.querySelector('.btn-cat-config')) return;
            
            // Encontrar o user ID na row
            var firstCell = row.querySelector('td');
            if (!firstCell) return;
            var userId = firstCell.textContent.trim();
            if (userId.indexOf('USR') !== 0) return;
            
            // Encontrar a coluna de ações
            var actionCell = row.querySelector('td:last-child');
            if (!actionCell) return;
            var btnContainer = actionCell.querySelector('div') || actionCell;
            
            // Adicionar botão de categorias
            var catBtn = document.createElement('button');
            catBtn.className = 'btn btn-sm btn-secondary btn-cat-config';
            catBtn.title = 'Categorias visiveis';
            catBtn.innerHTML = '<i class="fas fa-th-large"></i>';
            catBtn.onclick = function(e) { 
                e.stopPropagation(); 
                showUserCategoriesModal(userId); 
            };
            btnContainer.appendChild(catBtn);
        });
    });
}, 1000);

// Ajustar loadFromSupabase para carregar allowedCategories
var _origLoadUsers = loadFromSupabase;
// Nota: o campo allowed_categories já será carregado automaticamente pelo select=*
// Precisamos apenas mapear no carregamento
var _patchUsersInterval = setInterval(function() {
    if (!db.data.users || db.data.users.length === 0) return;
    db.data.users.forEach(function(u) {
        if (u.allowed_categories !== undefined && u.allowedCategories === undefined) {
            u.allowedCategories = u.allowed_categories || [];
        }
        if (!u.allowedCategories) u.allowedCategories = [];
    });
    clearInterval(_patchUsersInterval);
}, 2000);

console.log('features.js carregado');
