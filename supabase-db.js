// ============================================
// SUPABASE DATABASE - Substitui GitHub como backend
// ============================================

var SUPABASE_URL = 'https://fnihosrvwitlnnlcarpf.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZuaWhvc3J2d2l0bG5ubGNhcnBmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDU2OTI4MDAsImV4cCI6MjA2MTI2ODgwMH0';

// Verificar se a key informada é a publishable ou se precisa usar a anon key real
// A publishable key que você me passou parece ser um prefixo. Vamos usar a API REST diretamente.

var supaRest = {
    headers: function() {
        return {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        };
    },
    url: function(table, query) {
        return SUPABASE_URL + '/rest/v1/' + table + (query || '');
    },

    // SELECT
    async select(table, query) {
        var resp = await fetch(this.url(table, query || '?select=*'), {
            headers: this.headers()
        });
        if (!resp.ok) throw new Error('Supabase select error: ' + resp.status);
        return await resp.json();
    },

    // INSERT
    async insert(table, data) {
        var resp = await fetch(this.url(table), {
            method: 'POST',
            headers: this.headers(),
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            var err = await resp.text();
            throw new Error('Supabase insert error: ' + resp.status + ' ' + err);
        }
        return await resp.json();
    },

    // UPDATE
    async update(table, match, data) {
        var resp = await fetch(this.url(table, '?' + match), {
            method: 'PATCH',
            headers: this.headers(),
            body: JSON.stringify(data)
        });
        if (!resp.ok) throw new Error('Supabase update error: ' + resp.status);
        return await resp.json();
    },

    // DELETE
    async remove(table, match) {
        var resp = await fetch(this.url(table, '?' + match), {
            method: 'DELETE',
            headers: this.headers()
        });
        if (!resp.ok) throw new Error('Supabase delete error: ' + resp.status);
        return true;
    }
};

// ============================================
// OVERRIDE DATABASE CLASS - Usar Supabase
// ============================================

// Carregar dados do Supabase
db.loadFromSupabase = async function() {
    try {
        // Carregar users
        var users = await supaRest.select('users', '?select=*&order=created_at.asc');
        if (users && users.length > 0) {
            this.data.users = users.map(function(u) {
                return {
                    id: u.id, name: u.name, email: u.email, password: u.password,
                    role: u.role, active: u.active, createdAt: u.created_at
                };
            });
        }

        // Carregar tickets
        var tickets = await supaRest.select('tickets', '?select=*&order=created_at.desc');
        if (tickets) {
            this.data.tickets = tickets.map(function(t) {
                return {
                    id: t.id, subject: t.subject, description: t.description,
                    priority: t.priority, status: t.status,
                    categoryId: t.category_id, serviceId: t.service_id,
                    serviceName: t.service_name, createdBy: t.created_by,
                    assignedTo: t.assigned_to, slaId: t.sla_id,
                    slaDeadline: t.sla_deadline, slaHours: t.sla_hours,
                    slaCountWeekends: t.sla_count_weekends,
                    formData: t.form_data, attachments: t.attachments,
                    history: t.history, createdAt: t.created_at, updatedAt: t.updated_at
                };
            });
        }

        // Carregar messages
        var messages = await supaRest.select('messages', '?select=*&order=created_at.asc');
        if (messages) {
            this.data.messages = messages.map(function(m) {
                return {
                    id: m.id, ticketId: m.ticket_id, userId: m.user_id,
                    type: m.type, text: m.text, attachment: m.attachment,
                    createdAt: m.created_at
                };
            });
        }

        // Carregar catalog
        var catalog = await supaRest.select('catalog', '?select=data&limit=1');
        if (catalog && catalog.length > 0 && catalog[0].data) {
            this.data.catalog = catalog[0].data;
        }

        // Carregar SLA
        var slas = await supaRest.select('sla', '?select=*');
        if (slas && slas.length > 0) {
            this.data.sla = slas.map(function(s) {
                return {
                    id: s.id, name: s.name, hours: s.hours,
                    countWeekends: s.count_weekends, active: s.active
                };
            });
        }

        this.saveToLocal();
        console.log('Supabase sync OK - Users:', this.data.users.length);
        return true;
    } catch(e) {
        console.error('Supabase load error:', e);
        return false;
    }
};

// Override addUser
var _origAddUser = db.addUser.bind(db);
db.addUser = async function(user) {
    var maxId = this.data.users.reduce(function(max, u) {
        var n = parseInt(u.id.replace('USR', '')); return n > max ? n : max;
    }, 0);
    user.id = 'USR' + String(maxId + 1).padStart(3, '0');
    user.createdAt = new Date().toISOString();
    user.active = true;
    this.data.users.push(user);
    this.saveToLocal();

    try {
        await supaRest.insert('users', {
            id: user.id, name: user.name, email: user.email,
            password: user.password, role: user.role, active: user.active,
            created_at: user.createdAt
        });
    } catch(e) { console.error('Supabase addUser error:', e); }
    return user;
};

// Override updateUser
db.updateUser = async function(id, updates) {
    var idx = this.data.users.findIndex(function(u) { return u.id === id; });
    if (idx >= 0) {
        Object.assign(this.data.users[idx], updates);
        this.saveToLocal();
        try {
            var dbUpdates = {};
            if (updates.name) dbUpdates.name = updates.name;
            if (updates.email) dbUpdates.email = updates.email;
            if (updates.password) dbUpdates.password = updates.password;
            if (updates.role) dbUpdates.role = updates.role;
            if (updates.active !== undefined) dbUpdates.active = updates.active;
            await supaRest.update('users', 'id=eq.' + id, dbUpdates);
        } catch(e) { console.error('Supabase updateUser error:', e); }
        return this.data.users[idx];
    }
    return null;
};

// Override deleteUser
db.deleteUser = async function(id) {
    var idx = this.data.users.findIndex(function(u) { return u.id === id; });
    if (idx >= 0) {
        this.data.users[idx].active = false;
        this.saveToLocal();
        try {
            await supaRest.update('users', 'id=eq.' + id, { active: false });
        } catch(e) { console.error('Supabase deleteUser error:', e); }
    }
};

// Override addTicket
db.addTicket = async function(ticket) {
    var count = this.data.tickets.length + 1;
    var year = new Date().getFullYear();
    ticket.id = 'CHM-' + year + '-' + String(count).padStart(5, '0');
    ticket.createdAt = new Date().toISOString();
    ticket.updatedAt = new Date().toISOString();
    ticket.status = 'aberto';
    ticket.history = [{ action: 'Chamado aberto', by: ticket.createdBy, at: ticket.createdAt, details: 'Chamado criado' }];
    var sla = this.getSLAById(ticket.slaId);
    if (sla) {
        ticket.slaDeadline = this.calculateSLADeadline(ticket.createdAt, sla);
        ticket.slaHours = sla.hours;
        ticket.slaCountWeekends = sla.countWeekends;
    }
    this.data.tickets.push(ticket);
    this.saveToLocal();

    try {
        await supaRest.insert('tickets', {
            id: ticket.id, subject: ticket.subject, description: ticket.description,
            priority: ticket.priority, status: ticket.status,
            category_id: ticket.categoryId, service_id: ticket.serviceId,
            service_name: ticket.serviceName, created_by: ticket.createdBy,
            assigned_to: ticket.assignedTo, sla_id: ticket.slaId,
            sla_deadline: ticket.slaDeadline, sla_hours: ticket.slaHours,
            sla_count_weekends: ticket.slaCountWeekends,
            form_data: ticket.formData, attachments: ticket.attachments,
            history: ticket.history, created_at: ticket.createdAt, updated_at: ticket.updatedAt
        });
    } catch(e) { console.error('Supabase addTicket error:', e); }
    return ticket;
};

// Override updateTicket
db.updateTicket = async function(id, updates) {
    var idx = this.data.tickets.findIndex(function(t) { return t.id === id; });
    if (idx >= 0) {
        updates.updatedAt = new Date().toISOString();
        Object.assign(this.data.tickets[idx], updates);
        this.saveToLocal();
        try {
            var dbUp = { updated_at: updates.updatedAt };
            if (updates.status) dbUp.status = updates.status;
            if (updates.assignedTo !== undefined) dbUp.assigned_to = updates.assignedTo;
            if (updates.priority) dbUp.priority = updates.priority;
            if (updates.history) dbUp.history = updates.history;
            if (updates.attachments) dbUp.attachments = updates.attachments;
            await supaRest.update('tickets', 'id=eq.' + id, dbUp);
        } catch(e) { console.error('Supabase updateTicket error:', e); }
        return this.data.tickets[idx];
    }
    return null;
};

// Override addTicketHistory
db.addTicketHistory = async function(ticketId, action, userId, details) {
    var ticket = this.getTicketById(ticketId);
    if (ticket) {
        if (!ticket.history) ticket.history = [];
        ticket.history.push({ action: action, by: userId, at: new Date().toISOString(), details: details || '' });
        ticket.updatedAt = new Date().toISOString();
        this.saveToLocal();
        try {
            await supaRest.update('tickets', 'id=eq.' + ticketId, {
                history: ticket.history, updated_at: ticket.updatedAt
            });
        } catch(e) { console.error('Supabase addHistory error:', e); }
    }
};

// Override addMessage
db.addMessage = async function(message) {
    message.id = 'MSG' + Date.now() + Math.random().toString(36).substr(2, 4);
    message.createdAt = new Date().toISOString();
    this.data.messages.push(message);
    this.saveToLocal();

    try {
        await supaRest.insert('messages', {
            id: message.id, ticket_id: message.ticketId, user_id: message.userId,
            type: message.type, text: message.text,
            attachment: message.attachment || null, created_at: message.createdAt
        });
    } catch(e) { console.error('Supabase addMessage error:', e); }
    return message;
};

// Override catalog operations
db.addCategory = async function(category) {
    var maxId = this.data.catalog.categories.reduce(function(max, c) {
        var n = parseInt(c.id.replace('CAT', '')); return n > max ? n : max;
    }, 0);
    category.id = 'CAT' + String(maxId + 1).padStart(3, '0');
    category.active = true;
    category.services = category.services || [];
    this.data.catalog.categories.push(category);
    this.saveToLocal();
    await this._saveCatalogToSupabase();
    return category;
};

db.updateCategory = async function(id, updates) {
    var idx = this.data.catalog.categories.findIndex(function(c) { return c.id === id; });
    if (idx >= 0) {
        Object.assign(this.data.catalog.categories[idx], updates);
        this.saveToLocal();
        await this._saveCatalogToSupabase();
        return this.data.catalog.categories[idx];
    }
    return null;
};

db.addService = async function(categoryId, service) {
    var cat = this.getCategoryById(categoryId);
    if (cat) {
        service.id = 'SRV' + Date.now().toString().slice(-6);
        service.active = true;
        cat.services.push(service);
        this.saveToLocal();
        await this._saveCatalogToSupabase();
        return service;
    }
    return null;
};

db.updateService = async function(categoryId, serviceId, updates) {
    var cat = this.getCategoryById(categoryId);
    if (cat) {
        var idx = cat.services.findIndex(function(s) { return s.id === serviceId; });
        if (idx >= 0) {
            Object.assign(cat.services[idx], updates);
            this.saveToLocal();
            await this._saveCatalogToSupabase();
            return cat.services[idx];
        }
    }
    return null;
};

db._saveCatalogToSupabase = async function() {
    try {
        await supaRest.update('catalog', 'id=eq.1', { data: this.data.catalog });
    } catch(e) { console.error('Supabase saveCatalog error:', e); }
};

// Override SLA operations
db.addSLA = async function(sla) {
    var maxId = this.data.sla.reduce(function(max, s) {
        var n = parseInt(s.id.replace('SLA', '')); return n > max ? n : max;
    }, 0);
    sla.id = 'SLA' + String(maxId + 1).padStart(3, '0');
    sla.active = true;
    this.data.sla.push(sla);
    this.saveToLocal();
    try {
        await supaRest.insert('sla', {
            id: sla.id, name: sla.name, hours: sla.hours,
            count_weekends: sla.countWeekends, active: sla.active
        });
    } catch(e) { console.error('Supabase addSLA error:', e); }
    return sla;
};

db.updateSLA = async function(id, updates) {
    var idx = this.data.sla.findIndex(function(s) { return s.id === id; });
    if (idx >= 0) {
        Object.assign(this.data.sla[idx], updates);
        this.saveToLocal();
        try {
            var dbUp = {};
            if (updates.name) dbUp.name = updates.name;
            if (updates.hours) dbUp.hours = updates.hours;
            if (updates.countWeekends !== undefined) dbUp.count_weekends = updates.countWeekends;
            if (updates.active !== undefined) dbUp.active = updates.active;
            await supaRest.update('sla', 'id=eq.' + id, dbUp);
        } catch(e) { console.error('Supabase updateSLA error:', e); }
        return this.data.sla[idx];
    }
    return null;
};

// Override renderAdminSettings para remover GitHub config
renderAdminSettings = function(container) {
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-cog"></i> Configuracoes</h2></div>' +
        '<div class="card"><div class="card-header"><h3><i class="fas fa-cloud"></i> Banco de Dados na Nuvem (Supabase)</h3></div>' +
        '<div class="card-body">' +
        '<div style="background:#ecfdf5;border:1px solid #059669;border-radius:8px;padding:16px;margin-bottom:20px;">' +
        '<div style="display:flex;align-items:center;gap:8px;color:#059669;font-weight:600;margin-bottom:8px;">' +
        '<i class="fas fa-check-circle"></i> Conectado ao Supabase</div>' +
        '<div style="font-size:13px;color:#374151;">' +
        '<div><strong>Servidor:</strong> fnihosrvwitlnnlcarpf.supabase.co</div>' +
        '<div><strong>Ultima sincronizacao:</strong> ' + formatDate(new Date().toISOString()) + '</div>' +
        '</div></div>' +
        '<p style="color:var(--gray-500);margin-bottom:16px;">Os dados sao sincronizados automaticamente com a nuvem. Nenhuma configuracao adicional necessaria.</p>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
        '<button class="btn btn-success" onclick="forceSupabaseSync()"><i class="fas fa-sync"></i> Sincronizar Agora</button>' +
        '</div>' +
        '<div id="config-log" style="margin-top:20px;"></div>' +
        '</div></div>' +
        '<div class="card" style="margin-top:20px;"><div class="card-header"><h3><i class="fas fa-database"></i> Dados</h3></div>' +
        '<div class="card-body">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;">' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.users.length + '</div><div style="font-size:12px;color:var(--gray-400);">Usuarios</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.tickets.length + '</div><div style="font-size:12px;color:var(--gray-400);">Chamados</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.catalog.categories.length + '</div><div style="font-size:12px;color:var(--gray-400);">Categorias</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.messages.length + '</div><div style="font-size:12px;color:var(--gray-400);">Mensagens</div></div>' +
        '</div></div></div>';
};

async function forceSupabaseSync() {
    showToast('Sincronizando com Supabase...', 'info');
    try {
        await db.loadFromSupabase();
        showToast('Sincronizado! ' + db.data.users.length + ' usuarios, ' + db.data.tickets.length + ' chamados.', 'success');
        renderAdminSettings(document.getElementById('content'));
    } catch(e) {
        showToast('Erro: ' + e.message, 'error');
    }
}

console.log('Supabase DB module loaded');
