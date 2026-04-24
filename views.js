// ============================================
// VIEWS - Renderização das telas
// ============================================

function showLoginScreen() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('main-app').classList.remove('active');
    document.getElementById('login-form').reset();
}

function showMainApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('main-app').classList.add('active');

    // Update user info
    document.getElementById('user-name-display').textContent = currentUser.name;
    document.getElementById('user-role-display').textContent = getRoleName(currentUser.role);
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();

    buildSidebar();
    navigateTo('dashboard');
}

function buildSidebar() {
    const nav = document.getElementById('sidebar-nav');
    let html = '';

    // Menu comum
    html += `<div class="nav-section">Principal</div>`;
    html += `<div class="nav-item active" onclick="navigateTo('dashboard')" data-page="dashboard">
        <i class="fas fa-chart-pie"></i><span>Painel</span>
    </div>`;

    // Abrir chamado (todos)
    html += `<div class="nav-item" onclick="navigateTo('new-ticket')" data-page="new-ticket">
        <i class="fas fa-plus-circle"></i><span>Abrir Chamado</span>
    </div>`;

    // Meus chamados
    html += `<div class="nav-item" onclick="navigateTo('my-tickets')" data-page="my-tickets">
        <i class="fas fa-ticket-alt"></i><span>Meus Chamados</span>
    </div>`;

    // Analista / Admin
    if (isAnalyst()) {
        html += `<div class="nav-section">Atendimento</div>`;
        html += `<div class="nav-item" onclick="navigateTo('all-tickets')" data-page="all-tickets">
            <i class="fas fa-inbox"></i><span>Todos os Chamados</span>
            <span class="badge" id="badge-open">${db.getTickets({status:'aberto'}).length || ''}</span>
        </div>`;
        html += `<div class="nav-item" onclick="navigateTo('assigned-tickets')" data-page="assigned-tickets">
            <i class="fas fa-user-check"></i><span>Meus Atendimentos</span>
        </div>`;
    }

    // Admin
    if (isAdmin()) {
        html += `<div class="nav-section">Administração</div>`;
        html += `<div class="nav-item" onclick="navigateTo('admin-users')" data-page="admin-users">
            <i class="fas fa-users-cog"></i><span>Usuários</span>
        </div>`;
        html += `<div class="nav-item" onclick="navigateTo('admin-catalog')" data-page="admin-catalog">
            <i class="fas fa-th-large"></i><span>Catálogo de Serviços</span>
        </div>`;
        html += `<div class="nav-item" onclick="navigateTo('admin-sla')" data-page="admin-sla">
            <i class="fas fa-stopwatch"></i><span>Configurar SLA</span>
        </div>`;
        html += `<div class="nav-item" onclick="navigateTo('admin-settings')" data-page="admin-settings">
            <i class="fas fa-cog"></i><span>Configurações</span>
        </div>`;
    }

    nav.innerHTML = html;
}

function navigateTo(page, params = {}) {
    // Update sidebar active
    document.querySelectorAll('#sidebar-nav .nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === page) item.classList.add('active');
    });

    const content = document.getElementById('content');

    switch (page) {
        case 'dashboard': renderDashboard(content); break;
        case 'new-ticket': renderNewTicket(content); break;
        case 'my-tickets': renderMyTickets(content); break;
        case 'all-tickets': renderAllTickets(content); break;
        case 'assigned-tickets': renderAssignedTickets(content); break;
        case 'ticket-detail': renderTicketDetail(content, params.id); break;
        case 'catalog-services': renderCatalogServices(content, params.categoryId); break;
        case 'ticket-form': renderTicketForm(content, params.serviceId); break;
        case 'admin-users': renderAdminUsers(content); break;
        case 'admin-catalog': renderAdminCatalog(content); break;
        case 'admin-catalog-edit': renderAdminCatalogEdit(content, params.categoryId); break;
        case 'admin-sla': renderAdminSLA(content); break;
        case 'admin-settings': renderAdminSettings(content); break;
        default: renderDashboard(content);
    }
}

// ============ DASHBOARD ============
function renderDashboard(container) {
    const allTickets = isAnalyst() ? db.getTickets() : db.getTickets({ userId: currentUser.id });
    const open = allTickets.filter(t => t.status === 'aberto').length;
    const inProgress = allTickets.filter(t => t.status === 'em-andamento').length;
    const resolved = allTickets.filter(t => t.status === 'resolvido' || t.status === 'fechado').length;
    const overdue = allTickets.filter(t => {
        const sla = db.getSLAStatus(t);
        return sla.status === 'danger' && t.status !== 'fechado' && t.status !== 'cancelado';
    }).length;

    let html = `
        <div class="page-header">
            <h2><i class="fas fa-chart-pie"></i> Painel de Controle</h2>
            <span style="color:var(--gray-400);font-size:13px;">
                ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon blue"><i class="fas fa-folder-open"></i></div>
                <div class="stat-info"><h4>${open}</h4><p>Abertos</p></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon yellow"><i class="fas fa-spinner"></i></div>
                <div class="stat-info"><h4>${inProgress}</h4><p>Em Andamento</p></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon green"><i class="fas fa-check-circle"></i></div>
                <div class="stat-info"><h4>${resolved}</h4><p>Resolvidos</p></div>
            </div>
            <div class="stat-card">
                <div class="stat-icon red"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="stat-info"><h4>${overdue}</h4><p>SLA Estourado</p></div>
            </div>
        </div>

        <div class="card">
            <div class="card-header">
                <h3><i class="fas fa-clock" style="color:var(--primary);margin-right:8px;"></i> Chamados Recentes</h3>
            </div>
            <div class="card-body">
                ${renderTicketTable(allTickets.slice(0, 10))}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// ============ TICKET TABLE (REUSABLE) ============
function renderTicketTable(tickets) {
    if (tickets.length === 0) {
        return `<div class="empty-state">
            <i class="fas fa-inbox"></i>
            <h3>Nenhum chamado encontrado</h3>
            <p>Os chamados aparecerão aqui quando forem criados.</p>
        </div>`;
    }

    let html = `<div class="table-wrapper"><table>
        <thead><tr>
            <th>Nº</th>
            <th>Assunto</th>
            <th>Categoria</th>
            <th>Status</th>
            <th>Prioridade</th>
            <th>SLA</th>
            <th>Data</th>
            <th>Ações</th>
        </tr></thead><tbody>`;

    tickets.forEach(ticket => {
        const category = db.getCategoryById(ticket.categoryId);
        const slaStatus = db.getSLAStatus(ticket);
        const createdBy = db.getUserById(ticket.createdBy);

        html += `<tr>
            <td><strong style="color:var(--primary)">${ticket.id}</strong></td>
            <td>
                <div style="font-weight:500">${escapeHtml(ticket.subject)}</div>
                <div style="font-size:12px;color:var(--gray-400)">por ${createdBy ? createdBy.name : 'N/A'}</div>
            </td>
            <td>${category ? category.name : 'N/A'}</td>
            <td><span class="status-badge status-${ticket.status}">${formatStatus(ticket.status)}</span></td>
            <td><span class="priority-badge priority-${ticket.priority || 'media'}">${ticket.priority || 'Média'}</span></td>
            <td>
                <div class="sla-bar" style="width:80px;height:6px;">
                    <div class="sla-bar-fill sla-${slaStatus.status}" style="width:${slaStatus.percent}%"></div>
                </div>
                <div style="font-size:11px;color:var(--gray-400);margin-top:2px;">${slaStatus.text}</div>
            </td>
            <td style="font-size:13px;color:var(--gray-500)">${formatDate(ticket.createdAt)}</td>
            <td>
                <button class="btn btn-sm btn-primary" onclick="navigateTo('ticket-detail',{id:'${ticket.id}'})">
                    <i class="fas fa-eye"></i> Ver
                </button>
            </td>
        </tr>`;
    });

    html += `</tbody></table></div>`;
    return html;
}

// ============ NEW TICKET (CATALOG VIEW) ============
function renderNewTicket(container) {
    const categories = db.getCategories();

    let html = `
        <div class="page-header">
            <h2><i class="fas fa-plus-circle"></i> Abrir Chamado</h2>
        </div>
        <p style="color:var(--gray-500);margin-bottom:24px;">Selecione a categoria do serviço desejado:</p>
        <div class="catalog-grid">`;

    const iconColors = {
        'fa-money-bill-wave': '#059669',
        'fa-clock': '#2563eb',
        'fa-gift': '#7c3aed',
        'fa-graduation-cap': '#d97706',
        'fa-umbrella-beach': '#0891b2',
        'fa-file-alt': '#dc2626'
    };

    categories.forEach(cat => {
        const color = cat.color || iconColors[cat.icon] || '#2563eb';
        const activeServices = cat.services.filter(s => s.active !== false);

        html += `
            <div class="catalog-card" onclick="navigateTo('catalog-services',{categoryId:'${cat.id}'})">
                <div class="catalog-card-icon" style="background:${color}15;color:${color}">
                    <i class="fas ${cat.icon}"></i>
                </div>
                <h3>${escapeHtml(cat.name)}</h3>
                <p>${escapeHtml(cat.description)}</p>
                <div class="service-count">${activeServices.length} serviço(s) disponível(is)</div>
            </div>`;
    });

    html += `</div>`;
    container.innerHTML = html;
}

// ============ CATALOG SERVICES LIST ============
function renderCatalogServices(container, categoryId) {
    const category = db.getCategoryById(categoryId);
    if (!category) {
        navigateTo('new-ticket');
        return;
    }

    const services = category.services.filter(s => s.active !== false);

    let html = `
        <div class="back-link" onclick="navigateTo('new-ticket')">
            <i class="fas fa-arrow-left"></i> Voltar ao catálogo
        </div>
        <div class="page-header">
            <h2><i class="fas ${category.icon}" style="color:${category.color}"></i> ${escapeHtml(category.name)}</h2>
        </div>
        <p style="color:var(--gray-500);margin-bottom:24px;">${escapeHtml(category.description)}</p>
        <div class="service-list">`;

    services.forEach(service => {
        const sla = db.getSLAById(service.slaId);
        html += `
            <div class="service-item" onclick="navigateTo('ticket-form',{serviceId:'${service.id}'})">
                <div>
                    <div class="service-name">${escapeHtml(service.name)}</div>
                    <div class="service-sla">
                        ${service.description ? escapeHtml(service.description) : ''}
                        ${sla ? ` • SLA: ${sla.hours}h (${sla.countWeekends ? 'conta fins de semana' : 'dias úteis'})` : ''}
                    </div>
                </div>
                <i class="fas fa-chevron-right"></i>
            </div>`;
    });

    if (services.length === 0) {
        html += `<div class="empty-state"><i class="fas fa-info-circle"></i><h3>Nenhum serviço disponível</h3></div>`;
    }

    html += `</div>`;
    container.innerHTML = html;
}

// ============ TICKET FORM ============
function renderTicketForm(container, serviceId) {
    const serviceInfo = db.getServiceById(serviceId);
    if (!serviceInfo) {
        navigateTo('new-ticket');
        return;
    }

    const category = serviceInfo.category;
    const sla = db.getSLAById(serviceInfo.slaId);

    let formFieldsHtml = '';

    // Gerar campos dinâmicos com base no serviço
    const fieldDefinitions = {
        description: { label: 'Descrição detalhada', type: 'textarea', required: true },
        monthRef: { label: 'Mês de referência', type: 'month', required: true },
        yearRef: { label: 'Ano de referência', type: 'number', required: true },
        amount: { label: 'Valor (R$)', type: 'number', required: false },
        date: { label: 'Data', type: 'date', required: true },
        time: { label: 'Horário', type: 'time', required: false },
        startDate: { label: 'Data início', type: 'date', required: true },
        endDate: { label: 'Data fim', type: 'date', required: true },
        justification: { label: 'Justificativa', type: 'textarea', required: true },
        benefitType: { label: 'Tipo de benefício', type: 'select', options: ['Vale-Transporte','Vale-Refeição','Vale-Alimentação','Plano de Saúde','Plano Odontológico','Seguro de Vida','Outro'], required: true },
        courseName: { label: 'Nome do curso/treinamento', type: 'text', required: true },
        purpose: { label: 'Finalidade', type: 'text', required: false }
    };

    const fields = serviceInfo.formFields || ['description'];

    fields.forEach(fieldKey => {
        const def = fieldDefinitions[fieldKey] || { label: fieldKey, type: 'text', required: false };

        formFieldsHtml += `<div class="form-group">
            <label>${def.label} ${def.required ? '<span style="color:var(--danger)">*</span>' : ''}</label>`;

        if (def.type === 'textarea') {
            formFieldsHtml += `<textarea id="field-${fieldKey}" ${def.required ? 'required' : ''} placeholder="Descreva com detalhes..."></textarea>`;
        } else if (def.type === 'select') {
            formFieldsHtml += `<select id="field-${fieldKey}" ${def.required ? 'required' : ''}>
                <option value="">Selecione...</option>
                ${(def.options || []).map(o => `<option value="${o}">${o}</option>`).join('')}
            </select>`;
        } else {
            formFieldsHtml += `<input type="${def.type}" id="field-${fieldKey}" ${def.required ? 'required' : ''}>`;
        }

        formFieldsHtml += `</div>`;
    });

    let html = `
        <div class="back-link" onclick="navigateTo('catalog-services',{categoryId:'${category.id}'})">
            <i class="fas fa-arrow-left"></i> Voltar aos serviços
        </div>
        <div class="page-header">
            <h2><i class="fas fa-edit"></i> ${escapeHtml(serviceInfo.name)}</h2>
        </div>

        <div style="display:grid;grid-template-columns:1fr 320px;gap:24px;">
            <div class="card">
                <div class="card-header"><h3>Formulário do Chamado</h3></div>
                <div class="card-body">
                    <form id="ticket-form" onsubmit="return submitTicket(event, '${serviceId}')">
                        <div class="form-group">
                            <label>Assunto <span style="color:var(--danger)">*</span></label>
                            <input type="text" id="ticket-subject" required placeholder="Resumo breve do chamado" value="${escapeHtml(serviceInfo.name)}">
                        </div>

                        <div class="form-group">
                            <label>Prioridade</label>
                            <select id="ticket-priority">
                                <option value="baixa">Baixa</option>
                                <option value="media" selected>Média</option>
                                <option value="alta">Alta</option>
                                <option value="critica">Crítica</option>
                            </select>
                        </div>

                        ${formFieldsHtml}

                        <div class="form-group">
                            <label><i class="fas fa-paperclip"></i> Anexos</label>
                            <div class="file-upload-area" onclick="document.getElementById('ticket-files').click()">
                                <i class="fas fa-cloud-upload-alt"></i>
                                <p>Clique para selecionar arquivos ou arraste aqui</p>
                                <p style="font-size:11px;color:var(--gray-400)">PDF, DOC, JPG, PNG - Máx 10MB</p>
                            </div>
                            <input type="file" id="ticket-files" multiple style="display:none" onchange="handleFileSelect(this)">
                            <div id="file-list" class="file-list"></div>
                        </div>

                        <button type="submit" class="btn btn-primary btn-full" id="btn-submit-ticket">
                            <i class="fas fa-paper-plane"></i> Enviar Chamado
                        </button>
                    </form>
                </div>
            </div>

            <div>
                <div class="card" style="margin-bottom:16px;">
                    <div class="card-header"><h3>Informações</h3></div>
                    <div class="card-body">
                        <div style="margin-bottom:12px;">
                            <div style="font-size:12px;color:var(--gray-400);margin-bottom:4px;">Categoria</div>
                            <div style="font-weight:500"><i class="fas ${category.icon}" style="color:${category.color};margin-right:6px;"></i>${category.name}</div>
                        </div>
                        <div style="margin-bottom:12px;">
                            <div style="font-size:12px;color:var(--gray-400);margin-bottom:4px;">Serviço</div>
                            <div style="font-weight:500">${serviceInfo.name}</div>
                        </div>
                        ${sla ? `
                        <div style="margin-bottom:12px;">
                            <div style="font-size:12px;color:var(--gray-400);margin-bottom:4px;">Prazo de Atendimento (SLA)</div>
                            <div style="font-weight:600;color:var(--primary)">${sla.hours} horas</div>
                            <div style="font-size:12px;color:var(--gray-400)">${sla.countWeekends ? 'Conta sábado e domingo' : 'Apenas dias úteis'}</div>
                        </div>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// ============ MY TICKETS ============
function renderMyTickets(container) {
    const tickets = db.getTickets({ userId: currentUser.id });

    let html = `
        <div class="page-header">
            <h2><i class="fas fa-ticket-alt"></i> Meus Chamados</h2>
            <button class="btn btn-primary" onclick="navigateTo('new-ticket')">
                <i class="fas fa-plus"></i> Novo Chamado
            </button>
        </div>

        <div class="filters-bar">
            <div class="search-input">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Buscar chamado..." onkeyup="filterMyTickets(this.value)">
            </div>
            <select onchange="filterMyTicketsByStatus(this.value)">
                <option value="">Todos os status</option>
                <option value="aberto">Aberto</option>
                <option value="em-andamento">Em Andamento</option>
                <option value="pendente">Pendente</option>
                <option value="resolvido">Resolvido</option>
                <option value="fechado">Fechado</option>
            </select>
        </div>

        <div class="card">
            <div class="card-body" id="my-tickets-table">
                ${renderTicketTable(tickets)}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function filterMyTickets(search) {
    const tickets = db.getTickets({ userId: currentUser.id, search });
    document.getElementById('my-tickets-table').innerHTML = renderTicketTable(tickets);
}

function filterMyTicketsByStatus(status) {
    const filter = { userId: currentUser.id };
    if (status) filter.status = status;
    const tickets = db.getTickets(filter);
    document.getElementById('my-tickets-table').innerHTML = renderTicketTable(tickets);
}

// ============ ALL TICKETS (ANALYST) ============
function renderAllTickets(container) {
    const tickets = db.getTickets();

    let html = `
        <div class="page-header">
            <h2><i class="fas fa-inbox"></i> Todos os Chamados</h2>
        </div>

        <div class="filters-bar">
            <div class="search-input">
                <i class="fas fa-search"></i>
                <input type="text" placeholder="Buscar chamado..." onkeyup="filterAllTickets()">
            </div>
            <select id="filter-status" onchange="filterAllTickets()">
                <option value="">Todos os status</option>
                <option value="aberto">Aberto</option>
                <option value="em-andamento">Em Andamento</option>
                <option value="pendente">Pendente</option>
                <option value="resolvido">Resolvido</option>
                <option value="fechado">Fechado</option>
                <option value="cancelado">Cancelado</option>
            </select>
            <select id="filter-category" onchange="filterAllTickets()">
                <option value="">Todas categorias</option>
                ${db.getCategories().map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
            </select>
        </div>

        <div class="card">
            <div class="card-body" id="all-tickets-table">
                ${renderTicketTable(tickets)}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

function filterAllTickets() {
    const search = document.querySelector('.filters-bar .search-input input')?.value || '';
    const status = document.getElementById('filter-status')?.value || '';
    const category = document.getElementById('filter-category')?.value || '';

    const filter = {};
    if (search) filter.search = search;
    if (status) filter.status = status;
    if (category) filter.category = category;

    const tickets = db.getTickets(filter);
    document.getElementById('all-tickets-table').innerHTML = renderTicketTable(tickets);
}

// ============ ASSIGNED TICKETS ============
function renderAssignedTickets(container) {
    const tickets = db.getTickets({ assignedTo: currentUser.id });

    let html = `
        <div class="page-header">
            <h2><i class="fas fa-user-check"></i> Meus Atendimentos</h2>
        </div>

        <div class="card">
            <div class="card-body">
                ${renderTicketTable(tickets)}
            </div>
        </div>
    `;

    container.innerHTML = html;
}

// ============ UTILITIES ============
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatStatus(status) {
    const map = {
        'aberto': 'Aberto',
        'em-andamento': 'Em Andamento',
        'pendente': 'Pendente',
        'resolvido': 'Resolvido',
        'fechado': 'Fechado',
        'cancelado': 'Cancelado'
    };
    return map[status] || status;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

function openModal(title, bodyHtml, footerHtml = '') {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-overlay').classList.remove('active');
}
