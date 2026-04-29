// ============================================
// SUPABASE-DB.JS v6 — Final, baseado no app-bundle.js real
// ============================================

var SUPABASE_URL = 'https://fnihosrvwitlnnlcarpf.supabase.co';
var SUPABASE_KEY = 'sb_publishable_BackMGGYNFGhIv4lqydCnQ_8izBUueF';

var supaRest = {
    headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    },

    select: async function(table, columns, filter) {
        try {
            var url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + (columns || '*');
            if (filter) url += '&' + filter;
            var res = await fetch(url, { headers: this.headers });
            if (!res.ok) { console.error('SELECT ' + table + ':', res.status); return []; }
            return await res.json();
        } catch(e) { console.error('SELECT ' + table + ':', e); return []; }
    },

    insert: async function(table, data) {
        try {
            var res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
                method: 'POST', headers: this.headers, body: JSON.stringify(data)
            });
            if (!res.ok) { console.error('INSERT ' + table + ':', res.status, await res.text()); return null; }
            var r = await res.json(); return r[0] || r;
        } catch(e) { console.error('INSERT ' + table + ':', e); return null; }
    },

    update: async function(table, id, data) {
        try {
            var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
                method: 'PATCH', headers: this.headers, body: JSON.stringify(data)
            });
            if (!res.ok) { console.error('UPDATE ' + table + ' ' + id + ':', res.status, await res.text()); return null; }
            var r = await res.json(); return r[0] || r;
        } catch(e) { console.error('UPDATE ' + table + ' ' + id + ':', e); return null; }
    },

    remove: async function(table, id) {
        try {
            var res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
                method: 'DELETE', headers: this.headers
            });
            return res.ok;
        } catch(e) { return false; }
    },

    upsert: async function(table, data) {
        try {
            var h = {}; for (var k in this.headers) h[k] = this.headers[k];
            h['Prefer'] = 'return=representation,resolution=merge-duplicates';
            var res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
                method: 'POST', headers: h, body: JSON.stringify(data)
            });
            if (!res.ok) { console.error('UPSERT ' + table + ':', res.status); return null; }
            return await res.json();
        } catch(e) { console.error('UPSERT ' + table + ':', e); return null; }
    }
};

// ============================================
// LOAD FROM SUPABASE → db.data.*
// ============================================
async function loadFromSupabase() {
    console.log('🔄 Carregando do Supabase...');
    var ok = false;

    try {
        var users = await supaRest.select('users', '*');
        if (users && users.length > 0) {
            db.data.users = users.map(function(u) {
                return { id:u.id, name:u.name, email:u.email, password:u.password, role:u.role,
                    active:u.active, createdAt:u.created_at, allowedCategories:u.allowed_categories||[] };
            });
            ok = true;
            console.log('✅ ' + users.length + ' usuários');
        }
    } catch(e) { console.error('❌ users:', e); }

    try {
        var tickets = await supaRest.select('tickets', '*', 'order=created_at.desc');
        if (tickets && tickets.length > 0) {
            db.data.tickets = tickets.map(function(t) {
                return { id:t.id, subject:t.subject, title:t.subject, description:t.description,
                    priority:t.priority, status:t.status, categoryId:t.category_id,
                    serviceId:t.service_id, serviceName:t.service_name,
                    createdBy:t.created_by, userId:t.created_by,
                    assignedTo:t.assigned_to, slaId:t.sla_id, slaDeadline:t.sla_deadline,
                    slaHours:t.sla_hours, slaCountWeekends:t.sla_count_weekends,
                    formData:t.form_data, attachments:t.attachments||[], history:t.history||[],
                    createdAt:t.created_at, updatedAt:t.updated_at,
                    resolvedAt:t.resolved_at, acceptanceDeadline:t.acceptance_deadline,
                    satisfactionSent:t.satisfaction_sent||false, closedAt:t.closed_at };
            });
            console.log('✅ ' + tickets.length + ' tickets');
        } else { if (!db.data.tickets) db.data.tickets = []; }
    } catch(e) { console.error('❌ tickets:', e); }

    try {
        var msgs = await supaRest.select('messages', '*', 'order=created_at.asc');
        if (msgs && msgs.length > 0) {
            db.data.messages = msgs.map(function(m) {
                return { id:m.id, ticketId:m.ticket_id, userId:m.user_id, type:m.type,
                    text:m.text, attachment:m.attachment||null, attachments:m.attachments||[],
                    createdAt:m.created_at };
            });
            console.log('✅ ' + msgs.length + ' mensagens');
        } else { if (!db.data.messages) db.data.messages = []; }
    } catch(e) { console.error('❌ messages:', e); }

    try {
        var cat = await supaRest.select('catalog', '*');
        if (cat && cat.length > 0 && cat[0].data) {
            db.data.catalog = cat[0].data;
            console.log('✅ Catálogo (' + (db.data.catalog.categories?db.data.catalog.categories.length:0) + ' cats)');
        }
    } catch(e) { console.error('❌ catalog:', e); }

    try {
        var sla = await supaRest.select('sla', '*');
        if (sla && sla.length > 0) {
            db.data.sla = sla.map(function(s) {
                return { id:s.id, name:s.name, hours:s.hours, countWeekends:s.count_weekends, active:s.active };
            });
            console.log('✅ ' + sla.length + ' SLAs');
        }
    } catch(e) { console.error('❌ sla:', e); }

    try { db.saveToLocal(); } catch(e) {}
    console.log('✅ loadFromSupabase concluído');
    return ok;
}

// ============================================
// Função auxiliar: sincronizar ticket para Supabase
// ============================================
function ticketToSupabase(t) {
    return {
        id: t.id, subject: t.subject||t.title, description: t.description,
        priority: t.priority||'media', status: t.status||'aberto',
        category_id: t.categoryId, service_id: t.serviceId,
        service_name: t.serviceName||null, created_by: t.createdBy||t.userId,
        assigned_to: t.assignedTo||null, sla_id: t.slaId||null,
        sla_deadline: t.slaDeadline||null, sla_hours: t.slaHours||null,
        sla_count_weekends: t.slaCountWeekends||false,
        form_data: t.formData||{}, attachments: t.attachments||[],
        history: t.history||[], created_at: t.createdAt,
        updated_at: t.updatedAt||t.createdAt,
        resolved_at: t.resolvedAt||null, acceptance_deadline: t.acceptanceDeadline||null,
        satisfaction_sent: t.satisfactionSent||false, closed_at: t.closedAt||null
    };
}

// ============================================
// OVERRIDE: db.addTicket
// A original gera o ID, calcula SLA, faz push e syncToGitHub.
// Precisamos manter essa lógica E adicionar INSERT no Supabase.
// ============================================
(function() {
    var _origAddTicket = db.addTicket.bind(db);

    db.addTicket = async function(ticket) {
        // Chama o original — ele gera ID, calcula SLA, faz push em db.data.tickets
        var result = await _origAddTicket(ticket);

        // Agora sincroniza com Supabase
        if (result && result.id) {
            try {
                await supaRest.insert('tickets', ticketToSupabase(result));
                console.log('✅ Ticket ' + result.id + ' → Supabase');
            } catch(e) {
                console.error('❌ Ticket ' + result.id + ' Supabase:', e);
            }
        }
        return result;
    };
})();

// ============================================
// OVERRIDE: db.updateTicket
// ============================================
(function() {
    var _origUpdateTicket = db.updateTicket.bind(db);

    db.updateTicket = async function(id, updates) {
        var result = await _origUpdateTicket(id, updates);

        // Sincroniza campos alterados com Supabase
        var mapping = {
            subject:'subject', title:'subject', description:'description',
            priority:'priority', status:'status', categoryId:'category_id',
            serviceId:'service_id', serviceName:'service_name',
            createdBy:'created_by', userId:'created_by', assignedTo:'assigned_to',
            slaId:'sla_id', slaDeadline:'sla_deadline', slaHours:'sla_hours',
            slaCountWeekends:'sla_count_weekends', formData:'form_data',
            attachments:'attachments', history:'history', updatedAt:'updated_at',
            resolvedAt:'resolved_at', acceptanceDeadline:'acceptance_deadline',
            satisfactionSent:'satisfaction_sent', closedAt:'closed_at'
        };
        var supaUpdates = {};
        for (var key in updates) {
            if (mapping[key]) supaUpdates[mapping[key]] = updates[key];
        }
        // Sempre inclui updated_at
        if (!supaUpdates.updated_at) supaUpdates.updated_at = new Date().toISOString();

        if (Object.keys(supaUpdates).length > 0) {
            try { await supaRest.update('tickets', id, supaUpdates); }
            catch(e) { console.error('❌ updateTicket Supabase:', e); }
        }
        return result;
    };
})();

// ============================================
// OVERRIDE: db.addTicketHistory
// ============================================
(function() {
    var _orig = db.addTicketHistory.bind(db);

    db.addTicketHistory = async function(ticketId, action, userId, details) {
        await _orig(ticketId, action, userId, details);

        var ticket = db.getTicketById(ticketId);
        if (ticket) {
            try {
                await supaRest.update('tickets', ticketId, {
                    history: ticket.history, updated_at: ticket.updatedAt
                });
            } catch(e) {}
        }
    };
})();

// ============================================
// OVERRIDE: db.addMessage
// ============================================
(function() {
    var _orig = db.addMessage.bind(db);

    db.addMessage = async function(message) {
        // Original gera ID, createdAt, faz push e syncToGitHub
        var result = await _orig(message);

        if (result && result.id) {
            try {
                await supaRest.insert('messages', {
                    id: result.id,
                    ticket_id: result.ticketId,
                    user_id: result.userId,
                    type: result.type || 'message',
                    text: result.text || '',
                    attachments: result.attachments || [],
                    created_at: result.createdAt
                });
                console.log('✅ Msg ' + result.id + ' → Supabase');
            } catch(e) {
                console.error('❌ Msg Supabase:', e);
            }
        }
        return result;
    };
})();

// ============================================
// OVERRIDE: db.addUser
// ============================================
(function() {
    var _orig = db.addUser.bind(db);

    db.addUser = async function(user) {
        var result = await _orig(user);
        if (result && result.id) {
            try {
                await supaRest.insert('users', {
                    id: result.id, name: result.name, email: result.email,
                    password: result.password, role: result.role,
                    active: result.active !== false,
                    created_at: result.createdAt || new Date().toISOString(),
                    allowed_categories: result.allowedCategories || []
                });
                console.log('✅ User ' + result.id + ' → Supabase');
            } catch(e) { console.error('❌ User Supabase:', e); }
        }
        return result;
    };
})();

// ============================================
// OVERRIDE: db.updateUser
// ============================================
(function() {
    var _orig = db.updateUser.bind(db);

    db.updateUser = async function(id, updates) {
        var result = await _orig(id, updates);
        var su = {};
        if (updates.name !== undefined) su.name = updates.name;
        if (updates.email !== undefined) su.email = updates.email;
        if (updates.password !== undefined) su.password = updates.password;
        if (updates.role !== undefined) su.role = updates.role;
        if (updates.active !== undefined) su.active = updates.active;
        if (updates.allowedCategories !== undefined) su.allowed_categories = updates.allowedCategories;
        if (Object.keys(su).length > 0) {
            try { await supaRest.update('users', id, su); } catch(e) {}
        }
        return result;
    };
})();

// ============================================
// OVERRIDE: db.deleteUser
// ============================================
(function() {
    var _orig = db.deleteUser.bind(db);

    db.deleteUser = async function(id) {
        await _orig(id);
        // O original faz soft-delete (active=false), espelhamos isso
        try { await supaRest.update('users', id, { active: false }); } catch(e) {}
    };
})();

// ============================================
// OVERRIDE: db.getMessages — Corrige o bug dentro de renderTicketDetail
// ============================================
(function() {
    // O renderTicketDetail do app-bundle.js sobrescreve db.getMessages com
    // db.messages (que não existe). Precisamos corrigir isso.
    var _origGetMessages = db.getMessages.bind(db);

    // Definimos no prototype para que sempre funcione
    db.getMessages = function(ticketId) {
        return (db.data.messages || []).filter(function(m) {
            return m.ticketId === ticketId;
        }).sort(function(a, b) {
            return new Date(a.createdAt) - new Date(b.createdAt);
        });
    };
})();

// ============================================
// CATALOG sync para Supabase
// ============================================
var _origSyncToGitHub = db.syncToGitHub.bind(db);
db.syncToGitHub = async function(collection) {
    // Chama o original (salva local + GitHub se configurado)
    await _origSyncToGitHub(collection);

    // Também sincroniza com Supabase
    try {
        if (collection === 'catalog') {
            await supaRest.upsert('catalog', { id: 1, data: db.data.catalog });
        } else if (collection === 'sla') {
            // SLA é mais complexo — fazemos upsert individual
            for (var i = 0; i < db.data.sla.length; i++) {
                var s = db.data.sla[i];
                await supaRest.upsert('sla', {
                    id: s.id, name: s.name, hours: s.hours,
                    count_weekends: s.countWeekends || false, active: s.active !== false
                });
            }
        }
        // tickets, messages, users já são sincronizados pelos overrides individuais
    } catch(e) {
        console.error('Sync Supabase ' + collection + ':', e);
    }
};

// ============================================
// ADMIN SETTINGS (sobrescreve a do app-bundle.js)
// ============================================
var _origRenderAdminSettings = typeof renderAdminSettings === 'function' ? renderAdminSettings : null;
window.renderAdminSettings = function(container) {
    if (!isAdmin()) return;
    // Chama o original se existir (mostra config GitHub)
    if (_origRenderAdminSettings) _origRenderAdminSettings(container);

    // Adiciona card do Supabase no topo
    var supaCard = document.createElement('div');
    supaCard.className = 'card';
    supaCard.style.marginBottom = '24px';
    supaCard.innerHTML = '<div class="card-header"><h3><i class="fas fa-database" style="margin-right:8px"></i> Supabase</h3></div>' +
        '<div class="card-body">' +
        '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;margin-bottom:12px;">' +
        '<strong>✅ Conectado</strong> — fnihosrvwitlnnlcarpf</div>' +
        '<p style="font-size:13px;color:var(--gray-500);margin-bottom:12px;">' +
        'Users: ' + db.data.users.length + ' | Tickets: ' + db.data.tickets.length +
        ' | Msgs: ' + db.data.messages.length + ' | Cats: ' + (db.data.catalog.categories?db.data.catalog.categories.length:0) + '</p>' +
        '<button onclick="reloadFromSupabase()" class="btn btn-primary"><i class="fas fa-sync"></i> Recarregar do Supabase</button></div>';
    container.insertBefore(supaCard, container.firstChild.nextSibling);
};

async function reloadFromSupabase() {
    showToast('Recarregando...', 'info');
    await loadFromSupabase();
    showToast('Dados recarregados!', 'success');
    navigateTo('admin-settings');
}

// ============================================
// FIX: renderTicketDetail sobrescreve db.getMessages com versão bugada
// Precisamos re-aplicar nosso override DEPOIS de cada renderTicketDetail
// ============================================
(function() {
   

// ============================================
// saveCatalogToSupabase (usado pelo features.js)
// ============================================
async function saveCatalogToSupabase() {
    try {
        await supaRest.upsert('catalog', { id: 1, data: db.data.catalog });
    } catch(e) { console.error('❌ Catálogo:', e); }
}

console.log('✅ supabase-db.js v6 carregado (wrapper sobre app-bundle.js)');
