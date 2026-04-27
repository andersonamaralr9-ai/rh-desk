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
async function resolveTicket(ticketId, resolutionNote) {
    var ticket = db.getTicketById(ticketId);
    if (!ticket) return;
    var now = new Date();
    var deadline = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 dias
    
    var updates = {
        status: 'resolvido',
        resolvedAt: now.toISOString(),
        acceptanceDeadline: deadline.toISOString()
    };
    
    // Atualizar no Supabase
    try {
        await supaRest.update('tickets', 'id=eq.' + ticketId, {
            status: 'resolvido',
            resolved_at: now.toISOString(),
            acceptance_deadline: deadline.toISOString(),
            updated_at: now.toISOString()
        });
    } catch(e) { console.error('Erro resolve ticket:', e); }
    
    Object.assign(ticket, updates);
    ticket.updatedAt = now.toISOString();
    if (!ticket.history) ticket.history = [];
    ticket.history.push({
        action: 'Chamado resolvido',
        by: currentUser.id,
        at: now.toISOString(),
        details: resolutionNote || 'Aguardando aceite do usuario (3 dias)'
    });
    
    try {
        await supaRest.update('tickets', 'id=eq.' + ticketId, {
            history: ticket.history
        });
    } catch(e) {}
    
    db.saveToLocal();
    showToast('Chamado resolvido! Usuario tem 3 dias para aceitar ou reabrir.', 'success');
}

// Usuario aceita a resolução → fecha chamado e dispara pesquisa
async function acceptResolution(ticketId) {
    var ticket = db.getTicketById(ticketId);
    if (!ticket) return;
    var now = new Date().toISOString();
    
    ticket.status = 'fechado';
    ticket.closedAt = now;
    ticket.updatedAt = now;
    if (!ticket.history) ticket.history = [];
    ticket.history.push({
        action: 'Resolucao aceita pelo usuario',
        by: currentUser.id,
        at: now,
        details: 'Chamado fechado'
    });
    
    try {
        await supaRest.update('tickets', 'id=eq.' + ticketId, {
            status: 'fechado',
            closed_at: now,
            updated_at: now,
            history: ticket.history
        });
    } catch(e) { console.error('Erro accept:', e); }
    
    db.saveToLocal();
    showToast('Chamado fechado com sucesso!', 'success');
    
    // Mostrar pesquisa de satisfação
    showSatisfactionSurvey(ticketId);
}

// Usuario reabre o chamado
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

// Auto-fechar chamados com prazo expirado (roda no init e a cada sync)
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
    var bodyHtml = '<div style="text-align:center;padding:20px 0;">' +
        '<i class="fas fa-star" style="font-size:48px;color:#f59e0b;margin-bottom:16px;"></i>' +
        '<h3 style="margin-bottom:8px;">Como foi seu atendimento?</h3>' +
        '<p style="color:var(--gray-500);margin-bottom:24px;">Chamado: ' + ticketId + '</p>' +
        '<div id="star-rating" style="display:flex;justify-content:center;gap:8px;margin-bottom:24px;">';
    for (var i = 1; i <= 5; i++) {
        bodyHtml += '<i class="fas fa-star" data-rating="' + i + '" ' +
            'onclick="selectRating(' + i + ')" ' +
            'style="font-size:36px;color:#d1d5db;cursor:pointer;transition:color 0.2s;" ' +
            'onmouseenter="hoverRating(' + i + ')" onmouseleave="hoverRating(0)"></i>';
    }
    bodyHtml += '</div>' +
        '<input type="hidden" id="survey-rating" value="0">' +
        '<div class="form-group" style="text-align:left;">' +
        '<label>Comentario (opcional)</label>' +
        '<textarea id="survey-comment" rows="3" placeholder="Conte como foi sua experiencia..."></textarea>' +
        '</div></div>';
    
    var footerHtml = '<button class="btn btn-secondary" onclick="closeModal()">Pular</button>' +
        '<button class="btn btn-primary" onclick="submitSurvey(\'' + ticketId + '\')"><i class="fas fa-paper-plane"></i> Enviar Avaliacao</button>';
    
    openModal('Pesquisa de Satisfacao', bodyHtml, footerHtml);
}

function selectRating(n) {
    document.getElementById('survey-rating').value = n;
    var stars = document.querySelectorAll('#star-rating .fa-star');
    stars.forEach(function(s, idx) {
        s.style.color = idx < n ? '#f59e0b' : '#d1d5db';
    });
}

function hoverRating(n) {
    var current = parseInt(document.getElementById('survey-rating').value) || 0;
    var stars = document.querySelectorAll('#star-rating .fa-star');
    stars.forEach(function(s, idx) {
        if (n > 0) {
            s.style.color = idx < n ? '#f59e0b' : '#d1d5db';
        } else {
            s.style.color = idx < current ? '#f59e0b' : '#d1d5db';
        }
    });
}

async function submitSurvey(ticketId) {
    var rating = parseInt(document.getElementById('survey-rating').value);
    if (!rating || rating < 1) {
        showToast('Selecione uma nota de 1 a 5', 'warning');
        return;
    }
    var comment = document.getElementById('survey-comment').value.trim();
    var surveyId = 'SAT' + Date.now();
    
    try {
        await supaRest.insert('satisfaction_surveys', {
            id: surveyId,
            ticket_id: ticketId,
            user_id: currentUser.id,
            rating: rating,
            comment: comment
        });
        // Marcar ticket como pesquisa enviada
        await supaRest.update('tickets', 'id=eq.' + ticketId, {
            satisfaction_sent: true
        });
        var ticket = db.getTicketById(ticketId);
        if (ticket) ticket.satisfactionSent = true;
        db.saveToLocal();
        
        showToast('Obrigado pela avaliacao!', 'success');
        closeModal();
    } catch(e) {
        console.error('Erro survey:', e);
        showToast('Erro ao enviar avaliacao', 'error');
    }
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
        '<input type="date" id="rpt-date-from" onchange="applyReportFilters()"></div>' +
        '<div class="form-group" style="margin:0"><label style="font-size:12px">Data fim</label>' +
        '<input type="date" id="rpt-date-to" onchange="applyReportFilters()"></div>' +
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
    if (dateFrom) tickets = tickets.filter(function(t) { return t.createdAt >= dateFrom; });
    if (dateTo) tickets = tickets.filter(function(t) { return t.createdAt <= dateTo + 'T23:59:59'; });
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

console.log('features.js carregado');
