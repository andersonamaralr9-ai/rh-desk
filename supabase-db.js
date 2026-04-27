// ============================================
// SUPABASE DATABASE LAYER — v3 CORRIGIDO
// Colunas: created_by (não user_id), subject (não title)
// ============================================

var SUPABASE_URL = 'https://fnihosrvwitlnnlcarpf.supabase.co';
var SUPABASE_KEY = 'sb_publishable_BackMGGYNFGhIv4lqydCnQ_8izBUueF';

// === REST helper ===
var supaRest = {
    headers: function() {
        return {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    },
    select: async function(table, query) {
        var url = SUPABASE_URL + '/rest/v1/' + table;
        if (query) url += '?' + query;
        var resp = await fetch(url, { headers: this.headers() });
        if (!resp.ok) {
            var err = await resp.text();
            throw new Error('Supabase SELECT ' + table + ': ' + resp.status + ' ' + err);
        }
        return await resp.json();
    },
    insert: async function(table, data) {
        var resp = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            var err = await resp.text();
            throw new Error('Supabase INSERT ' + table + ': ' + resp.status + ' ' + err);
        }
        return await resp.json();
    },
    update: async function(table, matchQuery, data) {
        var resp = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + matchQuery, {
            method: 'PATCH',
            headers: this.headers(),
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            var err = await resp.text();
            throw new Error('Supabase UPDATE ' + table + ': ' + resp.status + ' ' + err);
        }
        return await resp.json();
    },
    remove: async function(table, matchQuery) {
        var resp = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?' + matchQuery, {
            method: 'DELETE',
            headers: this.headers()
        });
        if (!resp.ok) {
            var err = await resp.text();
            throw new Error('Supabase DELETE ' + table + ': ' + resp.status + ' ' + err);
        }
        return true;
    },
    upsert: async function(table, data, onConflict) {
        var h = this.headers();
        h['Prefer'] = 'return=representation,resolution=merge-duplicates';
        var url = SUPABASE_URL + '/rest/v1/' + table;
        if (onConflict) url += '?on_conflict=' + onConflict;
        var resp = await fetch(url, {
            method: 'POST',
            headers: h,
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            var err = await resp.text();
            throw new Error('Supabase UPSERT ' + table + ': ' + resp.status + ' ' + err);
        }
        return await resp.json();
    }
};

// === Carregar TUDO do Supabase para db.data ===
async function loadFromSupabase() {
    console.log('Carregando dados do Supabase...');
    try {
        // Users
        var users = await supaRest.select('users', 'select=*&order=created_at.asc');
        if (users && users.length > 0) {
            db.data.users = users.map(function(u) {
                return {
                    id: u.id,
                    name: u.name,
                    email: u.email,
                    password: u.password,
                    role: u.role,
                    active: u.active,
                    createdAt: u.created_at,
                    created_at: u.created_at
                };
            });
            console.log('Supabase users:', users.length);
        }

        // Tickets — colunas reais: created_by, subject (NÃO user_id, title)
        var tickets = await supaRest.select('tickets', 'select=*&order=created_at.desc');
        if (tickets) {
            db.data.tickets = tickets.map(function(t) {
                if (typeof t.history === 'string') try { t.history = JSON.parse(t.history); } catch(e) { t.history = []; }
                if (typeof t.form_data === 'string') try { t.form_data = JSON.parse(t.form_data); } catch(e) { t.form_data = {}; }
                if (!t.history) t.history = [];
                if (!t.form_data) t.form_data = {};
                return {
                    id: t.id,
                    createdBy: t.created_by,
                    userId: t.created_by,
                    categoryId: t.category_id,
                    serviceId: t.service_id,
                    subject: t.subject,
                    title: t.subject,
                    description: t.description,
                    priority: t.priority,
                    status: t.status,
                    assignedTo: t.assigned_to,
                    slaId: t.sla_id,
                    slaDeadline: t.sla_deadline || null,
                    createdAt: t.created_at,
                    updatedAt: t.updated_at,
                    closedAt: t.closed_at || null,
                    formData: t.form_data,
                    history: t.history,
                    attachments: t.attachments || [],
                    resolvedAt: t.resolved_at || null,
                    acceptanceDeadline: t.acceptance_deadline || null,
                    satisfactionSent: t.satisfaction_sent || false
                };
            });
            console.log('Supabase tickets:', db.data.tickets.length);
        }

        // Messages
        var messages = await supaRest.select('messages', 'select=*&order=created_at.asc');
        if (messages) {
            db.data.messages = messages.map(function(m) {
                return {
                    id: m.id,
                    ticketId: m.ticket_id,
                    userId: m.user_id,
                    text: m.text,
                    type: m.type,
                    attachments: m.attachments || [],
                    createdAt: m.created_at
                };
            });
            console.log('Supabase messages:', db.data.messages.length);
        }

        // Catalog
        var catalog = await supaRest.select('catalog', 'select=*');
        if (catalog && catalog.length > 0 && catalog[0].data) {
            db.data.catalog = catalog[0].data;
            console.log('Supabase catalog categories:', db.data.catalog.categories ? db.data.catalog.categories.length : 0);
        }

        // SLA
        var sla = await supaRest.select('sla', 'select=*&order=hours.asc');
        if (sla && sla.length > 0) {
            db.data.sla = sla.map(function(s) {
                return {
                    id: s.id,
                    name: s.name,
                    hours: s.hours,
                    countWeekends: s.count_weekends,
                    active: s.active
                };
            });
            console.log('Supabase sla:', db.data.sla.length);
        }

        db.saveToLocal();
        return true;
    } catch(e) {
        console.error('Erro ao carregar do Supabase:', e);
        return false;
    }
}

// === Sobrescrever db.addUser ===
db.addUser = async function(userData) {
    var maxNum = 0;
    db.data.users.forEach(function(u) {
        var num = parseInt(u.id.replace('USR', ''));
        if (num > maxNum) maxNum = num;
    });
    var newId = 'USR' + String(maxNum + 1).padStart(3, '0');
    var now = new Date().toISOString();

    var newUser = {
        id: newId,
        name: userData.name,
        email: userData.email,
        password: userData.password,
        role: userData.role || 'user',
        active: true,
        created_at: now
    };

    try {
        await supaRest.insert('users', newUser);
        console.log('Usuario criado no Supabase:', newId);
    } catch(e) {
        console.error('Erro Supabase addUser:', e);
    }

    var localUser = {
        id: newId,
        name: userData.name,
        email: userData.email,
        password: userData.password,
        role: userData.role || 'user',
        active: true,
        createdAt: now,
        created_at: now
    };
    db.data.users.push(localUser);
    db.saveToLocal();
    return localUser;
};

// === Sobrescrever db.updateUser ===
db.updateUser = async function(userId, updates) {
    var supaUpdates = {};
    if (updates.name !== undefined) supaUpdates.name = updates.name;
    if (updates.email !== undefined) supaUpdates.email = updates.email;
    if (updates.password !== undefined) supaUpdates.password = updates.password;
    if (updates.role !== undefined) supaUpdates.role = updates.role;
    if (updates.active !== undefined) supaUpdates.active = updates.active;

    try {
        await supaRest.update('users', 'id=eq.' + userId, supaUpdates);
    } catch(e) {
        console.error('Erro Supabase updateUser:', e);
    }

    var user = db.data.users.find(function(u) { return u.id === userId; });
    if (user) {
        Object.assign(user, updates);
        db.saveToLocal();
    }
    return user;
};

// === Sobrescrever db.deleteUser ===
db.deleteUser = async function(userId) {
    try {
        await supaRest.remove('users', 'id=eq.' + userId);
    } catch(e) {
        console.error('Erro Supabase deleteUser:', e);
    }
    db.data.users = db.data.users.filter(function(u) { return u.id !== userId; });
    db.saveToLocal();
};

// === Sobrescrever db.addTicket ===
// CORRIGIDO: usa created_by e subject (nomes reais das colunas)
db.addTicket = async function(ticketData) {
    var year = new Date().getFullYear();
    var maxNum = 0;
    db.data.tickets.forEach(function(t) {
        var parts = t.id.split('-');
        if (parts.length === 3) {
            var num = parseInt(parts[2]);
            if (num > maxNum) maxNum = num;
        }
    });
    var newId = 'CHM-' + year + '-' + String(maxNum + 1).padStart(5, '0');
    var now = new Date().toISOString();

    // Compatibilidade: aceitar tanto createdBy quanto userId
    var theUserId = ticketData.createdBy || ticketData.userId || (currentUser ? currentUser.id : '');
    var theSubject = ticketData.subject || ticketData.title || '';

    var sla = db.getSLAById(ticketData.slaId);
    var slaDeadline = sla ? db.calculateSLADeadline(now, sla) : null;

    var historyEntry = [{
        action: 'Chamado aberto',
        by: theUserId,
        at: now,
        details: 'Chamado criado no sistema'
    }];

    // Objeto para Supabase — COLUNAS REAIS: created_by, subject
    var supaTicket = {
        id: newId,
        created_by: theUserId,
        category_id: ticketData.categoryId,
        service_id: ticketData.serviceId,
        subject: theSubject,
        description: ticketData.description || '',
        priority: ticketData.priority || 'media',
        status: 'aberto',
        assigned_to: ticketData.assignedTo || null,
        sla_id: ticketData.slaId || 'SLA001',
        sla_deadline: slaDeadline,
        created_at: now,
        updated_at: now,
        closed_at: null,
        form_data: ticketData.formData || {},
        history: historyEntry,
        attachments: ticketData.attachments || []
    };

    try {
        await supaRest.insert('tickets', supaTicket);
        console.log('Ticket criado no Supabase:', newId);
    } catch(e) {
        console.error('ERRO Supabase addTicket:', e);
        showToast('Erro ao salvar chamado no servidor: ' + e.message, 'error');
    }

    // Objeto local (camelCase) - manter AMBOS createdBy e userId
    var localTicket = {
        id: newId,
        createdBy: theUserId,
        userId: theUserId,
        categoryId: ticketData.categoryId,
        serviceId: ticketData.serviceId,
        subject: theSubject,
        title: theSubject,
        description: ticketData.description || '',
        priority: ticketData.priority || 'media',
        status: 'aberto',
        assignedTo: ticketData.assignedTo || null,
        slaId: ticketData.slaId || 'SLA001',
        slaDeadline: slaDeadline,
        slaHours: sla ? sla.hours : null,
        slaCountWeekends: sla ? sla.countWeekends : false,
        createdAt: now,
        updatedAt: now,
        closedAt: null,
        formData: ticketData.formData || {},
        history: historyEntry,
        attachments: ticketData.attachments || []
    };

    db.data.tickets.push(localTicket);
    db.saveToLocal();
    return localTicket;
};

// === Sobrescrever db.updateTicket ===
// CORRIGIDO: usa created_by, subject, closed_at
db.updateTicket = async function(ticketId, updates) {
    var ticket = db.data.tickets.find(function(t) { return t.id === ticketId; });
    if (!ticket) return null;

    Object.assign(ticket, updates);
    ticket.updatedAt = new Date().toISOString();

    // Mapear camelCase → snake_case para Supabase
    var supaUpdates = { updated_at: ticket.updatedAt };
    if (updates.status !== undefined) supaUpdates.status = updates.status;
    if (updates.priority !== undefined) supaUpdates.priority = updates.priority;
    if (updates.assignedTo !== undefined) supaUpdates.assigned_to = updates.assignedTo;
    if (updates.closedAt !== undefined) supaUpdates.closed_at = updates.closedAt;
    if (updates.history !== undefined) supaUpdates.history = updates.history;
    if (updates.description !== undefined) supaUpdates.description = updates.description;
    if (updates.subject !== undefined) supaUpdates.subject = updates.subject;
    if (updates.resolvedAt !== undefined) supaUpdates.resolved_at = updates.resolvedAt;
    if (updates.acceptanceDeadline !== undefined) supaUpdates.acceptance_deadline = updates.acceptanceDeadline;
    if (updates.satisfactionSent !== undefined) supaUpdates.satisfaction_sent = updates.satisfactionSent;

    try {
        await supaRest.update('tickets', 'id=eq.' + ticketId, supaUpdates);
    } catch(e) {
        console.error('Erro Supabase updateTicket:', e);
    }

    db.saveToLocal();
    return ticket;
};

// === Adicionar historico ao ticket ===
db.addTicketHistory = async function(ticketId, action, userId, details) {
    var ticket = db.data.tickets.find(function(t) { return t.id === ticketId; });
    if (!ticket) return;

    if (!ticket.history) ticket.history = [];
    var entry = {
        action: action,
        by: userId,
        at: new Date().toISOString(),
        details: details || ''
    };
    ticket.history.push(entry);
    ticket.updatedAt = new Date().toISOString();

    try {
        await supaRest.update('tickets', 'id=eq.' + ticketId, {
            history: ticket.history,
            updated_at: ticket.updatedAt
        });
    } catch(e) {
        console.error('Erro Supabase addTicketHistory:', e);
    }

    db.saveToLocal();
};

// === Sobrescrever db.addMessage ===
db.addMessage = async function(messageData) {
    var maxNum = 0;
    db.data.messages.forEach(function(m) {
        var num = parseInt(m.id.replace('MSG', ''));
        if (!isNaN(num) && num > maxNum) maxNum = num;
    });
    var newId = 'MSG' + String(maxNum + 1).padStart(5, '0');
    var now = new Date().toISOString();

    var supaMsg = {
        id: newId,
        ticket_id: messageData.ticketId,
        user_id: messageData.userId,
        text: messageData.text,
        type: messageData.type || 'message',
        attachments: messageData.attachments || [],
        created_at: now
    };

    try {
        await supaRest.insert('messages', supaMsg);
    } catch(e) {
        console.error('Erro Supabase addMessage:', e);
    }

    var localMsg = {
        id: newId,
        ticketId: messageData.ticketId,
        userId: messageData.userId,
        text: messageData.text,
        type: messageData.type || 'message',
        attachments: messageData.attachments || [],
        createdAt: now
    };

    db.data.messages.push(localMsg);
    db.saveToLocal();
    return localMsg;
};

// === Funções de catálogo ===
db.addCategory = async function(categoryData) {
    if (!db.data.catalog.categories) db.data.catalog.categories = [];
    var maxNum = 0;
    db.data.catalog.categories.forEach(function(c) {
        var num = parseInt(c.id.replace('CAT', ''));
        if (num > maxNum) maxNum = num;
    });
    var newId = 'CAT' + String(maxNum + 1).padStart(3, '0');
    var cat = {
        id: newId,
        name: categoryData.name,
        description: categoryData.description || '',
        icon: categoryData.icon || 'fa-folder',
        color: categoryData.color || '#6b7280',
        active: true,
        services: []
    };
    db.data.catalog.categories.push(cat);
    await saveCatalogToSupabase();
    db.saveToLocal();
    return cat;
};

db.updateCategory = async function(catId, updates) {
    var cat = db.data.catalog.categories.find(function(c) { return c.id === catId; });
    if (cat) {
        Object.assign(cat, updates);
        await saveCatalogToSupabase();
        db.saveToLocal();
    }
    return cat;
};

db.deleteCategory = async function(catId) {
    db.data.catalog.categories = db.data.catalog.categories.filter(function(c) { return c.id !== catId; });
    await saveCatalogToSupabase();
    db.saveToLocal();
};

db.addService = async function(catId, serviceData) {
    var cat = db.data.catalog.categories.find(function(c) { return c.id === catId; });
    if (!cat) return null;
    if (!cat.services) cat.services = [];
    var maxNum = 0;
    db.data.catalog.categories.forEach(function(c) {
        if (c.services) c.services.forEach(function(s) {
            var num = parseInt(s.id.replace('SRV', ''));
            if (num > maxNum) maxNum = num;
        });
    });
    var newId = 'SRV' + String(maxNum + 1).padStart(3, '0');
    var srv = {
        id: newId,
        name: serviceData.name,
        description: serviceData.description || '',
        formFields: serviceData.formFields || ['description'],
        slaId: serviceData.slaId || 'SLA001',
        active: true
    };
    cat.services.push(srv);
    await saveCatalogToSupabase();
    db.saveToLocal();
    return srv;
};

db.updateService = async function(catId, serviceId, updates) {
    var cat = db.data.catalog.categories.find(function(c) { return c.id === catId; });
    if (!cat || !cat.services) return null;
    var srv = cat.services.find(function(s) { return s.id === serviceId; });
    if (srv) {
        Object.assign(srv, updates);
        await saveCatalogToSupabase();
        db.saveToLocal();
    }
    return srv;
};

db.deleteService = async function(catId, serviceId) {
    var cat = db.data.catalog.categories.find(function(c) { return c.id === catId; });
    if (cat && cat.services) {
        cat.services = cat.services.filter(function(s) { return s.id !== serviceId; });
        await saveCatalogToSupabase();
        db.saveToLocal();
    }
};

async function saveCatalogToSupabase() {
    try {
        await supaRest.upsert('catalog', { id: 1, data: db.data.catalog }, 'id');
    } catch(e) {
        console.error('Erro Supabase saveCatalog:', e);
    }
}

// === Funções de SLA ===
db.addSLA = async function(slaData) {
    var maxNum = 0;
    db.data.sla.forEach(function(s) {
        var num = parseInt(s.id.replace('SLA', ''));
        if (num > maxNum) maxNum = num;
    });
    var newId = 'SLA' + String(maxNum + 1).padStart(3, '0');
    var slaItem = {
        id: newId,
        name: slaData.name,
        hours: parseInt(slaData.hours),
        countWeekends: slaData.countWeekends || false,
        active: true
    };
    db.data.sla.push(slaItem);
    try {
        await supaRest.insert('sla', {
            id: newId,
            name: slaData.name,
            hours: parseInt(slaData.hours),
            count_weekends: slaData.countWeekends || false,
            active: true
        });
    } catch(e) {
        console.error('Erro Supabase addSLA:', e);
    }
    db.saveToLocal();
    return slaItem;
};

db.updateSLA = async function(slaId, updates) {
    var sla = db.data.sla.find(function(s) { return s.id === slaId; });
    if (sla) {
        Object.assign(sla, updates);
        var supaUpdates = {};
        if (updates.name !== undefined) supaUpdates.name = updates.name;
        if (updates.hours !== undefined) supaUpdates.hours = parseInt(updates.hours);
        if (updates.countWeekends !== undefined) supaUpdates.count_weekends = updates.countWeekends;
        if (updates.active !== undefined) supaUpdates.active = updates.active;
        try {
            await supaRest.update('sla', 'id=eq.' + slaId, supaUpdates);
        } catch(e) {
            console.error('Erro Supabase updateSLA:', e);
        }
        db.saveToLocal();
    }
    return sla;
};

db.deleteSLA = async function(slaId) {
    db.data.sla = db.data.sla.filter(function(s) { return s.id !== slaId; });
    try {
        await supaRest.remove('sla', 'id=eq.' + slaId);
    } catch(e) {
        console.error('Erro Supabase deleteSLA:', e);
    }
    db.saveToLocal();
};

// === Tela de Configurações ===
renderAdminSettings = function(container) {
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-cog"></i> Configuracoes</h2></div>' +
        '<div class="card"><div class="card-header"><h3><i class="fas fa-database"></i> Banco de Dados - Supabase</h3></div>' +
        '<div class="card-body">' +
        '<div style="background:#ecfdf5;border:1px solid #059669;border-radius:8px;padding:16px;margin-bottom:24px;">' +
        '<div style="display:flex;align-items:center;gap:8px;color:#059669;font-weight:600;margin-bottom:8px;">' +
        '<i class="fas fa-check-circle"></i> Conectado ao Supabase</div>' +
        '<div style="font-size:13px;color:#374151;">' +
        '<div><strong>Projeto:</strong> fnihosrvwitlnnlcarpf</div>' +
        '<div><strong>Tipo:</strong> PostgreSQL (Supabase REST API)</div>' +
        '<div><strong>Sincronizacao:</strong> Automatica em tempo real</div>' +
        '</div></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px;">' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.users.length + '</div><div style="font-size:12px;color:var(--gray-400);">Usuarios</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.tickets.length + '</div><div style="font-size:12px;color:var(--gray-400);">Chamados</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + (db.data.catalog.categories ? db.data.catalog.categories.length : 0) + '</div><div style="font-size:12px;color:var(--gray-400);">Categorias</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.messages.length + '</div><div style="font-size:12px;color:var(--gray-400);">Mensagens</div></div>' +
        '</div>' +
        '<button class="btn btn-primary" onclick="reloadFromSupabase()"><i class="fas fa-sync"></i> Recarregar Dados</button>' +
        '</div></div>';
};

async function reloadFromSupabase() {
    showToast('Recarregando do Supabase...', 'info');
    var ok = await loadFromSupabase();
    if (ok) {
        showToast('Dados atualizados!', 'success');
        renderAdminSettings(document.getElementById('content'));
    } else {
        showToast('Erro ao recarregar', 'error');
    }
}

// Dentro de loadFromSupabase, substituir o bloco de Users por:
var users = await supaRest.select('users', 'select=*&order=created_at.asc');
if (users && users.length > 0) {
    db.data.users = users.map(function(u) {
        return {
            id: u.id,
            name: u.name,
            email: u.email,
            password: u.password,
            role: u.role,
            active: u.active,
            createdAt: u.created_at,
            created_at: u.created_at,
            allowedCategories: u.allowed_categories || []
        };
    });
    console.log('Supabase users:', users.length);
}

console.log('supabase-db.js v3 carregado (created_by/subject)');
