// ============================================
// SUPABASE-DB.JS v5 — Corrigido para db.data.*
// ============================================

const SUPABASE_URL = 'https://fnihosrvwitlnnlcarpf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BackMGGYNFGhIv4lqydCnQ_8izBUueF';

const supaRest = {
    headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    },

    async select(table, columns, filter) {
        try {
            let url = SUPABASE_URL + '/rest/v1/' + table + '?select=' + (columns || '*');
            if (filter) url += '&' + filter;
            const res = await fetch(url, { headers: this.headers });
            if (!res.ok) {
                console.error('SELECT ' + table + ' falhou:', res.status, await res.text());
                return [];
            }
            return await res.json();
        } catch(e) {
            console.error('SELECT ' + table + ' erro:', e);
            return [];
        }
    },

    async insert(table, data) {
        try {
            const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                console.error('INSERT ' + table + ' falhou:', res.status, await res.text());
                return null;
            }
            const result = await res.json();
            return result[0] || result;
        } catch(e) {
            console.error('INSERT ' + table + ' erro:', e);
            return null;
        }
    },

    async update(table, id, data) {
        try {
            const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
                method: 'PATCH',
                headers: this.headers,
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                console.error('UPDATE ' + table + ' ' + id + ' falhou:', res.status, await res.text());
                return null;
            }
            const result = await res.json();
            return result[0] || result;
        } catch(e) {
            console.error('UPDATE ' + table + ' ' + id + ' erro:', e);
            return null;
        }
    },

    async remove(table, id) {
        try {
            const res = await fetch(SUPABASE_URL + '/rest/v1/' + table + '?id=eq.' + encodeURIComponent(id), {
                method: 'DELETE',
                headers: this.headers
            });
            if (!res.ok) {
                console.error('DELETE ' + table + ' ' + id + ' falhou:', res.status);
                return false;
            }
            return true;
        } catch(e) {
            console.error('DELETE ' + table + ' ' + id + ' erro:', e);
            return false;
        }
    },

    async upsert(table, data) {
        try {
            const res = await fetch(SUPABASE_URL + '/rest/v1/' + table, {
                method: 'POST',
                headers: Object.assign({}, this.headers, { 'Prefer': 'return=representation,resolution=merge-duplicates' }),
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                console.error('UPSERT ' + table + ' falhou:', res.status, await res.text());
                return null;
            }
            return await res.json();
        } catch(e) {
            console.error('UPSERT ' + table + ' erro:', e);
            return null;
        }
    }
};

// ============================================
// LOAD FROM SUPABASE → Escreve em db.data.*
// ============================================
async function loadFromSupabase() {
    console.log('🔄 Carregando dados do Supabase...');
    var ok = false;

    // === USERS ===
    try {
        var users = await supaRest.select('users', '*');
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
                    allowedCategories: u.allowed_categories || []
                };
            });
            ok = true;
            console.log('✅ ' + users.length + ' usuários carregados');
        }
    } catch(e) {
        console.error('❌ Erro usuários:', e);
    }

    // === TICKETS ===
    try {
        var tickets = await supaRest.select('tickets', '*', 'order=created_at.desc');
        if (tickets && tickets.length > 0) {
            db.data.tickets = tickets.map(function(t) {
                return {
                    id: t.id,
                    subject: t.subject,
                    title: t.subject,
                    description: t.description,
                    priority: t.priority,
                    status: t.status,
                    categoryId: t.category_id,
                    serviceId: t.service_id,
                    serviceName: t.service_name,
                    createdBy: t.created_by,
                    userId: t.created_by,
                    assignedTo: t.assigned_to,
                    slaId: t.sla_id,
                    slaDeadline: t.sla_deadline,
                    slaHours: t.sla_hours,
                    slaCountWeekends: t.sla_count_weekends,
                    formData: t.form_data,
                    attachments: t.attachments || [],
                    history: t.history || [],
                    createdAt: t.created_at,
                    updatedAt: t.updated_at,
                    resolvedAt: t.resolved_at,
                    acceptanceDeadline: t.acceptance_deadline,
                    satisfactionSent: t.satisfaction_sent || false,
                    closedAt: t.closed_at
                };
            });
            console.log('✅ ' + tickets.length + ' tickets carregados');
        } else {
            if (!db.data.tickets) db.data.tickets = [];
        }
    } catch(e) {
        console.error('❌ Erro tickets:', e);
    }

    // === MESSAGES ===
    try {
        var messages = await supaRest.select('messages', '*', 'order=created_at.asc');
        if (messages && messages.length > 0) {
            db.data.messages = messages.map(function(m) {
                return {
                    id: m.id,
                    ticketId: m.ticket_id,
                    userId: m.user_id,
                    type: m.type,
                    text: m.text,
                    attachment: m.attachment || null,
                    attachments: m.attachments || [],
                    createdAt: m.created_at
                };
            });
            console.log('✅ ' + messages.length + ' mensagens carregadas');
        } else {
            if (!db.data.messages) db.data.messages = [];
        }
    } catch(e) {
        console.error('❌ Erro mensagens:', e);
    }

    // === CATALOG ===
    try {
        var catalog = await supaRest.select('catalog', '*');
        if (catalog && catalog.length > 0 && catalog[0].data) {
            db.data.catalog = catalog[0].data;
            console.log('✅ Catálogo carregado (' + (db.data.catalog.categories ? db.data.catalog.categories.length : 0) + ' categorias)');
        }
    } catch(e) {
        console.error('❌ Erro catálogo:', e);
    }

    // === SLA ===
    try {
        var sla = await supaRest.select('sla', '*');
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
            console.log('✅ ' + sla.length + ' SLAs carregados');
        }
    } catch(e) {
        console.error('❌ Erro SLA:', e);
    }

    // Salva no localStorage como backup
    try { db.saveToLocal(); } catch(e) {}

    console.log('✅ loadFromSupabase concluído');
    return ok;
}

// ============================================
// OVERRIDE: db.addUser
// ============================================
(function() {
    var _orig = db.addUser ? db.addUser.bind(db) : null;
    db.addUser = async function(user) {
        if (_orig) _orig(user);
        else { if (!db.data.users) db.data.users = []; db.data.users.push(user); }

        try {
            await supaRest.insert('users', {
                id: user.id,
                name: user.name,
                email: user.email,
                password: user.password,
                role: user.role,
                active: user.active !== false,
                created_at: user.createdAt || new Date().toISOString(),
                allowed_categories: user.allowedCategories || []
            });
            console.log('✅ Usuário ' + user.id + ' salvo no Supabase');
        } catch(e) {
            console.error('❌ Erro salvar user:', e);
        }
        db.saveToLocal();
    };
})();

// ============================================
// OVERRIDE: db.updateUser
// ============================================
(function() {
    db.updateUser = async function(userId, updates) {
        var user = db.data.users.find(function(u) { return u.id === userId; });
        if (!user) return;
        Object.assign(user, updates);

        var supaUpdates = {};
        if (updates.name !== undefined) supaUpdates.name = updates.name;
        if (updates.email !== undefined) supaUpdates.email = updates.email;
        if (updates.password !== undefined) supaUpdates.password = updates.password;
        if (updates.role !== undefined) supaUpdates.role = updates.role;
        if (updates.active !== undefined) supaUpdates.active = updates.active;
        if (updates.allowedCategories !== undefined) supaUpdates.allowed_categories = updates.allowedCategories;

        try {
            await supaRest.update('users', userId, supaUpdates);
        } catch(e) { console.error('❌ Erro update user:', e); }
        db.saveToLocal();
    };
})();

// ============================================
// OVERRIDE: db.deleteUser
// ============================================
(function() {
    db.deleteUser = async function(userId) {
        db.data.users = db.data.users.filter(function(u) { return u.id !== userId; });
        try { await supaRest.remove('users', userId); } catch(e) {}
        db.saveToLocal();
    };
})();

// ============================================
// OVERRIDE: db.addTicket
// ============================================
(function() {
    var _orig = db.addTicket ? db.addTicket.bind(db) : null;
    db.addTicket = async function(ticket) {
        var localTicket = Object.assign({}, ticket, {
            title: ticket.subject || ticket.title,
            subject: ticket.subject || ticket.title,
            userId: ticket.createdBy || ticket.userId,
            createdBy: ticket.createdBy || ticket.userId
        });

        if (_orig) _orig(localTicket);
        else { if (!db.data.tickets) db.data.tickets = []; db.data.tickets.push(localTicket); }

        try {
            await supaRest.insert('tickets', {
                id: ticket.id,
                subject: localTicket.subject,
                description: ticket.description,
                priority: ticket.priority || 'media',
                status: ticket.status || 'aberto',
                category_id: ticket.categoryId,
                service_id: ticket.serviceId,
                service_name: ticket.serviceName || null,
                created_by: localTicket.createdBy,
                assigned_to: ticket.assignedTo || null,
                sla_id: ticket.slaId || null,
                sla_deadline: ticket.slaDeadline || null,
                sla_hours: ticket.slaHours || null,
                sla_count_weekends: ticket.slaCountWeekends || false,
                form_data: ticket.formData || {},
                attachments: ticket.attachments || [],
                history: ticket.history || [],
                created_at: ticket.createdAt || new Date().toISOString(),
                updated_at: ticket.updatedAt || new Date().toISOString(),
                resolved_at: ticket.resolvedAt || null,
                acceptance_deadline: ticket.acceptanceDeadline || null,
                satisfaction_sent: ticket.satisfactionSent || false,
                closed_at: ticket.closedAt || null
            });
            console.log('✅ Ticket ' + ticket.id + ' salvo no Supabase');
        } catch(e) {
            console.error('❌ Erro salvar ticket:', e);
        }
        db.saveToLocal();
        return localTicket;
    };
})();

// ============================================
// OVERRIDE: db.updateTicket
// ============================================
(function() {
    db.updateTicket = async function(ticketId, updates) {
        var ticket = db.data.tickets.find(function(t) { return t.id === ticketId; });
        if (!ticket) return;
        Object.assign(ticket, updates);
        if (updates.subject) ticket.title = updates.subject;
        if (updates.title) ticket.subject = updates.title;
        if (updates.createdBy) ticket.userId = updates.createdBy;
        if (updates.userId) ticket.createdBy = updates.userId;

        var mapping = {
            subject: 'subject', title: 'subject',
            description: 'description', priority: 'priority',
            status: 'status', categoryId: 'category_id',
            serviceId: 'service_id', serviceName: 'service_name',
            createdBy: 'created_by', userId: 'created_by',
            assignedTo: 'assigned_to', slaId: 'sla_id',
            slaDeadline: 'sla_deadline', slaHours: 'sla_hours',
            slaCountWeekends: 'sla_count_weekends',
            formData: 'form_data', attachments: 'attachments',
            history: 'history', updatedAt: 'updated_at',
            resolvedAt: 'resolved_at', acceptanceDeadline: 'acceptance_deadline',
            satisfactionSent: 'satisfaction_sent', closedAt: 'closed_at'
        };
        var supaUpdates = {};
        for (var key in updates) {
            if (mapping[key]) supaUpdates[mapping[key]] = updates[key];
        }
        if (Object.keys(supaUpdates).length > 0) {
            try { await supaRest.update('tickets', ticketId, supaUpdates); } catch(e) { console.error('❌ Erro update ticket:', e); }
        }
        db.saveToLocal();
    };
})();

// ============================================
// OVERRIDE: db.addTicketHistory
// ============================================
(function() {
    db.addTicketHistory = async function(ticketId, entry) {
        var ticket = db.data.tickets.find(function(t) { return t.id === ticketId; });
        if (!ticket) return;
        if (!ticket.history) ticket.history = [];
        ticket.history.push(entry);
        try {
            await supaRest.update('tickets', ticketId, {
                history: ticket.history,
                updated_at: new Date().toISOString()
            });
        } catch(e) {}
        db.saveToLocal();
    };
})();

// ============================================
// OVERRIDE: db.addMessage
// ============================================
(function() {
    db.addMessage = async function(msg) {
        var maxId = 0;
        (db.data.messages || []).forEach(function(m) {
            var num = parseInt((m.id || '').replace('MSG', ''));
            if (num > maxId) maxId = num;
        });
        var msgId = msg.id || ('MSG' + String(maxId + 1).padStart(5, '0'));
        var now = new Date().toISOString();

        var localMsg = {
            id: msgId,
            ticketId: msg.ticketId,
            userId: msg.userId,
            type: msg.type || 'message',
            text: msg.text || '',
            attachment: msg.attachment || null,
            attachments: msg.attachments || [],
            createdAt: msg.createdAt || now
        };

        if (!db.data.messages) db.data.messages = [];
        db.data.messages.push(localMsg);

        // Upload de anexos para Supabase Storage
        var uploadedAttachments = [];
        if (localMsg.attachments && localMsg.attachments.length > 0) {
            for (var i = 0; i < localMsg.attachments.length; i++) {
                var att = localMsg.attachments[i];
                if (typeof att === 'string' && att.startsWith('http')) {
                    uploadedAttachments.push(att);
                } else if (att && att.data) {
                    try {
                        var fileName = 'messages/' + msgId + '/' + Date.now() + '_' + (att.name || 'file');
                        var blob = att.data instanceof Blob ? att.data : null;
                        if (!blob && typeof att.data === 'string') {
                            blob = await fetch(att.data).then(function(r) { return r.blob(); });
                        }
                        if (blob) {
                            var uploadRes = await fetch(SUPABASE_URL + '/storage/v1/object/attachments/' + fileName, {
                                method: 'POST',
                                headers: {
                                    'apikey': SUPABASE_KEY,
                                    'Authorization': 'Bearer ' + SUPABASE_KEY,
                                    'Content-Type': blob.type || 'application/octet-stream'
                                },
                                body: blob
                            });
                            if (uploadRes.ok) {
                                uploadedAttachments.push(SUPABASE_URL + '/storage/v1/object/public/attachments/' + fileName);
                            } else {
                                uploadedAttachments.push(att);
                            }
                        } else {
                            uploadedAttachments.push(att);
                        }
                    } catch(e) {
                        uploadedAttachments.push(att);
                    }
                } else {
                    uploadedAttachments.push(att);
                }
            }
        }

        try {
            await supaRest.insert('messages', {
                id: msgId,
                ticket_id: localMsg.ticketId,
                user_id: localMsg.userId,
                type: localMsg.type,
                text: localMsg.text,
                attachments: uploadedAttachments.length > 0 ? uploadedAttachments : [],
                created_at: localMsg.createdAt
            });
            console.log('✅ Msg ' + msgId + ' salva');
        } catch(e) {
            console.error('❌ Erro salvar msg:', e);
        }
        db.saveToLocal();
        return localMsg;
    };
})();

// ============================================
// OVERRIDE: db.getMessages
// ============================================
db.getMessages = function(ticketId) {
    return (db.data.messages || []).filter(function(m) { return m.ticketId === ticketId; });
};

// ============================================
// CATALOG MANAGEMENT
// ============================================
async function saveCatalogToSupabase() {
    try {
        await supaRest.upsert('catalog', { id: 1, data: db.data.catalog });
        console.log('✅ Catálogo salvo');
    } catch(e) {
        console.error('❌ Erro catálogo:', e);
    }
}

(function() {
    db.addCategory = async function(cat) {
        if (!db.data.catalog) db.data.catalog = { categories: [] };
        if (!db.data.catalog.categories) db.data.catalog.categories = [];
        db.data.catalog.categories.push(cat);
        await saveCatalogToSupabase();
        db.saveToLocal();
    };
    db.updateCategory = async function(catId, updates) {
        var cat = (db.data.catalog.categories || []).find(function(c) { return c.id === catId; });
        if (cat) Object.assign(cat, updates);
        await saveCatalogToSupabase();
        db.saveToLocal();
    };
    db.deleteCategory = async function(catId) {
        if (db.data.catalog && db.data.catalog.categories) {
            db.data.catalog.categories = db.data.catalog.categories.filter(function(c) { return c.id !== catId; });
        }
        await saveCatalogToSupabase();
        db.saveToLocal();
    };
    db.addService = async function(catId, service) {
        var cat = (db.data.catalog.categories || []).find(function(c) { return c.id === catId; });
        if (cat) { if (!cat.services) cat.services = []; cat.services.push(service); }
        await saveCatalogToSupabase();
        db.saveToLocal();
    };
    db.updateService = async function(catId, serviceId, updates) {
        var cat = (db.data.catalog.categories || []).find(function(c) { return c.id === catId; });
        if (cat) {
            var svc = (cat.services || []).find(function(s) { return s.id === serviceId; });
            if (svc) Object.assign(svc, updates);
        }
        await saveCatalogToSupabase();
        db.saveToLocal();
    };
    db.deleteService = async function(catId, serviceId) {
        var cat = (db.data.catalog.categories || []).find(function(c) { return c.id === catId; });
        if (cat && cat.services) {
            cat.services = cat.services.filter(function(s) { return s.id !== serviceId; });
        }
        await saveCatalogToSupabase();
        db.saveToLocal();
    };
    db.getCategories = function() {
        return (db.data.catalog && db.data.catalog.categories) ? db.data.catalog.categories.filter(function(c) { return c.active !== false; }) : [];
    };
    db.getServices = function(catId) {
        var cat = (db.data.catalog && db.data.catalog.categories || []).find(function(c) { return c.id === catId; });
        return cat ? (cat.services || []) : [];
    };
})();

// ============================================
// SLA MANAGEMENT
// ============================================
(function() {
    db.addSLA = async function(sla) {
        if (!db.data.sla) db.data.sla = [];
        db.data.sla.push(sla);
        try {
            await supaRest.insert('sla', {
                id: sla.id, name: sla.name, hours: sla.hours,
                count_weekends: sla.countWeekends || false,
                active: sla.active !== false
            });
        } catch(e) {}
        db.saveToLocal();
    };
    db.updateSLA = async function(slaId, updates) {
        var sla = (db.data.sla || []).find(function(s) { return s.id === slaId; });
        if (sla) Object.assign(sla, updates);
        var su = {};
        if (updates.name !== undefined) su.name = updates.name;
        if (updates.hours !== undefined) su.hours = updates.hours;
        if (updates.countWeekends !== undefined) su.count_weekends = updates.countWeekends;
        if (updates.active !== undefined) su.active = updates.active;
        try { await supaRest.update('sla', slaId, su); } catch(e) {}
        db.saveToLocal();
    };
    db.deleteSLA = async function(slaId) {
        db.data.sla = (db.data.sla || []).filter(function(s) { return s.id !== slaId; });
        try { await supaRest.remove('sla', slaId); } catch(e) {}
        db.saveToLocal();
    };
})();

// ============================================
// ADMIN SETTINGS UI
// ============================================
function renderAdminSettings() {
    var content = document.getElementById('content');
    if (!content) return;
    var uc = (db.data.users || []).length;
    var tc = (db.data.tickets || []).length;
    var cc = (db.data.catalog && db.data.catalog.categories) ? db.data.catalog.categories.length : 0;
    var mc = (db.data.messages || []).length;

    content.innerHTML =
        '<div style="padding:20px;">' +
        '<h2><i class="fas fa-cog"></i> Configurações</h2>' +
        '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:15px;margin:15px 0;">' +
        '<p><strong>✅ Supabase conectado</strong></p>' +
        '<p style="color:#666;font-size:13px;">Projeto: fnihosrvwitlnnlcarpf</p></div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin:15px 0;">' +
        '<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:bold;color:#3b82f6;">' + uc + '</div><div style="color:#666;">Usuários</div></div>' +
        '<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:bold;color:#10b981;">' + tc + '</div><div style="color:#666;">Chamados</div></div>' +
        '<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:bold;color:#8b5cf6;">' + cc + '</div><div style="color:#666;">Categorias</div></div>' +
        '<div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:bold;color:#f59e0b;">' + mc + '</div><div style="color:#666;">Mensagens</div></div>' +
        '</div>' +
        '<button onclick="reloadFromSupabase()" style="background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">' +
        '<i class="fas fa-sync"></i> Recarregar do Supabase</button></div>';
}

async function reloadFromSupabase() {
    showToast('Recarregando...', 'info');
    await loadFromSupabase();
    showToast('Dados recarregados!', 'success');
    renderAdminSettings();
}

console.log('✅ supabase-db.js v5 carregado (db.data.*)');
