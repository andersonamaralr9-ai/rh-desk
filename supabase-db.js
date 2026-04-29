// ============================================
// SUPABASE-DB.JS v9 — Fix de anexos
// ============================================

var SUPABASE_URL = 'https://fnihosrvwitlnnlcarpf.supabase.co';
var SUPABASE_KEY = 'sb_publishable_BackMGGYNFGhIv4lqydCnQ_8izBUueF';
var STORAGE_BUCKET = 'rhdesk-attachments';

// ============================================
// REST API wrapper
// ============================================
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
// STORAGE helpers
// ============================================
function dataURLtoBlob(dataURL) {
    try {
        var parts = dataURL.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bstr = atob(parts[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        for (var i = 0; i < n; i++) u8arr[i] = bstr.charCodeAt(i);
        return new Blob([u8arr], { type: mime });
    } catch (e) {
        console.error('Erro dataURLtoBlob:', e);
        return null;
    }
}

async function uploadBlobToStorage(blob, ticketId, fileName) {
    try {
        var safeName = (fileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        var storagePath = ticketId + '/' + Date.now() + '_' + safeName;
        var url = SUPABASE_URL + '/storage/v1/object/' + STORAGE_BUCKET + '/' + encodeURIComponent(storagePath);
        var response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': 'Bearer ' + SUPABASE_KEY,
                'Content-Type': blob.type || 'application/octet-stream',
                'x-upsert': 'true'
            },
            body: blob
        });
        if (!response.ok) {
            console.error('Upload Storage erro:', response.status, await response.text());
            return null;
        }
        var publicURL = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + storagePath;
        console.log('✅ Upload concluído:', publicURL);
        return publicURL;
    } catch (e) {
        console.error('Erro upload:', e);
        return null;
    }
}

// ============================================
// LOAD FROM SUPABASE
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
                var att = null;
                if (m.attachment && typeof m.attachment === 'string' && m.attachment.startsWith('http')) {
                    att = {
                        url: m.attachment, data: m.attachment, path: m.attachment,
                        name: (m.attachments && m.attachments[0] && m.attachments[0].name) || 'arquivo',
                        type: (m.attachments && m.attachments[0] && m.attachments[0].type) || 'application/octet-stream',
                        size: (m.attachments && m.attachments[0] && m.attachments[0].size) || 0
                    };
                } else if (m.attachments && m.attachments.length > 0 && m.attachments[0].url) {
                    att = {
                        url: m.attachments[0].url, data: m.attachments[0].url, path: m.attachments[0].url,
                        name: m.attachments[0].name || 'arquivo',
                        type: m.attachments[0].type || 'application/octet-stream',
                        size: m.attachments[0].size || 0
                    };
                }
                return { id:m.id, ticketId:m.ticket_id, userId:m.user_id, type:m.type,
                    text:m.text, attachment:att, attachments:m.attachments||[],
                    createdAt:m.created_at };
            });
            console.log('✅ ' + msgs.length + ' mensagens');
        } else { if (!db.data.messages) db.data.messages = []; }
    } catch(e) { console.error('❌ messages:', e); }
    try {
        var cat = await supaRest.select('catalog', '*');
        if (cat && cat.length > 0 && cat[0].data) {
            db.data.catalog = cat[0].data;
            console.log('✅ Catálogo');
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
// APLICAR OVERRIDES
// ============================================
function applySupabaseOverrides() {
    if (!window.db) {
        console.error('❌ db não existe!');
        return;
    }
    console.log('🔧 Aplicando overrides Supabase v9...');

    // --- addTicket ---
    var _origAddTicket = db.addTicket.bind(db);
    db.addTicket = async function(ticket) {
        var result = await _origAddTicket(ticket);
        if (result && result.id) {
            try { await supaRest.insert('tickets', ticketToSupabase(result)); console.log('✅ Ticket ' + result.id + ' → Supabase'); }
            catch(e) { console.error('❌ Ticket:', e); }
        }
        return result;
    };

    // --- updateTicket ---
    var _origUpdateTicket = db.updateTicket.bind(db);
    db.updateTicket = async function(id, updates) {
        var result = await _origUpdateTicket(id, updates);
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
        var su = {};
        for (var key in updates) { if (mapping[key]) su[mapping[key]] = updates[key]; }
        if (!su.updated_at) su.updated_at = new Date().toISOString();
        if (Object.keys(su).length > 0) {
            try { await supaRest.update('tickets', id, su); } catch(e) { console.error('❌ updateTicket:', e); }
        }
        return result;
    };

    // --- addTicketHistory ---
    var _origAddTicketHistory = db.addTicketHistory.bind(db);
    db.addTicketHistory = async function(ticketId, action, userId, details) {
        await _origAddTicketHistory(ticketId, action, userId, details);
        var ticket = db.getTicketById(ticketId);
        if (ticket) {
            try { await supaRest.update('tickets', ticketId, { history: ticket.history, updated_at: ticket.updatedAt }); } catch(e) {}
        }
    };

    // --- addMessage (recebe UM OBJETO) ---
    var _origAddMessage = db.addMessage.bind(db);
    db.addMessage = async function(message) {
        var result = await _origAddMessage(message);
        if (!result || !result.id) return result;

        (async function() {
            try {
                var attachmentURL = null;
                var attachmentsArray = [];
                var att = result.attachment || (message && message.attachment);

                if (att) {
                    var base64Data = null;
                    var attName = 'arquivo';

                    if (typeof att === 'object') {
                        base64Data = att.data || att.url || null;
                        attName = att.name || att.fileName || 'arquivo';
                    } else if (typeof att === 'string') {
                        base64Data = att;
                    }

                    if (base64Data && typeof base64Data === 'string' && base64Data.startsWith('data:')) {
                        var blob = dataURLtoBlob(base64Data);
                        if (blob) {
                            var uploadedURL = await uploadBlobToStorage(blob, result.ticketId || message.ticketId, attName);
                            if (uploadedURL) {
                                attachmentURL = uploadedURL;
                                attachmentsArray = [{ name: attName, url: uploadedURL, type: (att && att.type) || blob.type, size: (att && att.size) || blob.size }];
                                var localMsg = (db.data.messages || []).find(function(m) { return m.id === result.id; });
                                if (localMsg) {
                                    localMsg.attachment = { name: attName, url: uploadedURL, data: uploadedURL, path: uploadedURL, type: (att && att.type) || blob.type, size: (att && att.size) || blob.size };
                                }
                            }
                        }
                    } else if (base64Data && typeof base64Data === 'string' && base64Data.startsWith('http')) {
                        attachmentURL = base64Data;
                        attachmentsArray = [{ name: attName, url: base64Data, type: (att && att.type) || '', size: (att && att.size) || 0 }];
                    }
                }

                await supaRest.insert('messages', {
                    id: result.id, ticket_id: result.ticketId || message.ticketId,
                    user_id: result.userId || message.userId,
                    type: result.type || message.type || 'message',
                    text: result.text || message.text || '',
                    attachment: attachmentURL, attachments: attachmentsArray,
                    created_at: result.createdAt || new Date().toISOString()
                });
                console.log('✅ Msg ' + result.id + ' → Supabase');
            } catch(e) { console.error('❌ Msg:', e); }
        })();

        return result;
    };

    // --- addUser ---
    var _origAddUser = db.addUser.bind(db);
    db.addUser = async function(user) {
        var result = await _origAddUser(user);
        if (result && result.id) {
            try {
                await supaRest.insert('users', {
                    id: result.id, name: result.name, email: result.email,
                    password: result.password, role: result.role,
                    active: result.active !== false,
                    created_at: result.createdAt || new Date().toISOString(),
                    allowed_categories: result.allowedCategories || []
                });
            } catch(e) { console.error('❌ User:', e); }
        }
        return result;
    };

    // --- updateUser ---
    var _origUpdateUser = db.updateUser.bind(db);
    db.updateUser = async function(id, updates) {
        var result = await _origUpdateUser(id, updates);
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

    // --- deleteUser ---
    var _origDeleteUser = db.deleteUser.bind(db);
    db.deleteUser = async function(id) {
        await _origDeleteUser(id);
        try { await supaRest.update('users', id, { active: false }); } catch(e) {}
    };

    // --- syncToGitHub → also Supabase ---
    var _origSync = db.syncToGitHub.bind(db);
    db.syncToGitHub = async function(collection) {
        await _origSync(collection);
        try {
            if (collection === 'catalog') {
                await supaRest.upsert('catalog', { id: 1, data: db.data.catalog });
            } else if (collection === 'sla') {
                for (var i = 0; i < db.data.sla.length; i++) {
                    var s = db.data.sla[i];
                    await supaRest.upsert('sla', { id: s.id, name: s.name, hours: s.hours, count_weekends: s.countWeekends || false, active: s.active !== false });
                }
            }
        } catch(e) { console.error('Sync Supabase ' + collection + ':', e); }
    };

    // ============================================
    // FIX CRÍTICO: Override de sendFileMessage
    // O app-bundle.js envia para GitHub, mas precisamos
    // enviar para Supabase Storage
    // ============================================
    window.sendFileMessage = async function(ticketId, input) {
        var file = input.files[0];
        if (!file) return;

        console.log('📎 Enviando arquivo:', file.name, file.size, 'bytes');

        try {
            // Upload direto para Supabase Storage (sem base64 intermediário)
            var publicURL = await uploadBlobToStorage(file, ticketId, file.name);

            if (!publicURL) {
                // Fallback: tentar via base64
                var reader = new FileReader();
                var base64 = await new Promise(function(resolve) {
                    reader.onload = function() { resolve(reader.result); };
                    reader.readAsDataURL(file);
                });
                var blob = dataURLtoBlob(base64);
                if (blob) {
                    publicURL = await uploadBlobToStorage(blob, ticketId, file.name);
                }
            }

            var attachment = {
                name: file.name,
                size: file.size,
                type: file.type,
                url: publicURL || '#',
                data: publicURL || '#',
                path: publicURL || '#'
            };

            await db.addMessage({
                ticketId: ticketId,
                userId: currentUser.id,
                type: 'message',
                text: 'Arquivo: ' + file.name,
                attachment: attachment
            });

            showToast('Arquivo enviado!', 'success');
            renderTicketDetail(document.getElementById('content'), ticketId);

        } catch(e) {
            console.error('❌ Erro ao enviar arquivo:', e);
            showToast('Erro ao enviar arquivo', 'error');
        }
    };

    console.log('✅ sendFileMessage sobrescrito para usar Supabase Storage');
    console.log('✅ Todos os overrides v9 aplicados');
}

// ============================================
// Utilitários globais
// ============================================
async function saveCatalogToSupabase() {
    try { await supaRest.upsert('catalog', { id: 1, data: db.data.catalog }); }
    catch(e) { console.error('❌ Catálogo:', e); }
}

async function reloadFromSupabase() {
    showToast('Recarregando...', 'info');
    await loadFromSupabase();
    showToast('Dados recarregados!', 'success');
}

async function reloadMessagesFromSupabase(ticketId) {
    try {
        var freshMsgs = await supaRest.select('messages', '*', 'ticket_id=eq.' + ticketId + '&order=created_at.asc');
        if (freshMsgs && freshMsgs.length) {
            db.data.messages = (db.data.messages || []).filter(function(m) { return m.ticketId !== ticketId; });
            freshMsgs.forEach(function(m) {
                var att = null;
                if (m.attachment && typeof m.attachment === 'string' && m.attachment.startsWith('http')) {
                    att = { url: m.attachment, data: m.attachment, path: m.attachment,
                        name: (m.attachments && m.attachments[0] && m.attachments[0].name) || 'arquivo',
                        type: (m.attachments && m.attachments[0] && m.attachments[0].type) || 'application/octet-stream',
                        size: (m.attachments && m.attachments[0] && m.attachments[0].size) || 0 };
                } else if (m.attachments && m.attachments.length > 0 && m.attachments[0].url) {
                    att = { url: m.attachments[0].url, data: m.attachments[0].url, path: m.attachments[0].url,
                        name: m.attachments[0].name || 'arquivo', type: m.attachments[0].type || 'application/octet-stream',
                        size: m.attachments[0].size || 0 };
                }
                db.data.messages.push({ id: m.id, ticketId: m.ticket_id, userId: m.user_id, type: m.type,
                    text: m.text, attachment: att, attachments: m.attachments || [], createdAt: m.created_at });
            });
        }
    } catch (e) { console.error('Erro reloadMessages:', e); }
}

// ============================================
// INICIALIZAÇÃO — esperar db existir
// ============================================
(function() {
    var checkInterval = setInterval(function() {
        if (window.db && db.data && db.data.users) {
            clearInterval(checkInterval);
            applySupabaseOverrides();
            loadFromSupabase().then(function(ok) {
                if (ok) {
                    console.log('✅ Supabase carregado');
                    if (typeof checkSession === 'function' && typeof currentUser !== 'undefined') {
                        if (checkSession()) {
                            if (typeof showMainApp === 'function') showMainApp();
                        }
                    }
                }
            }).catch(function(e) { console.error('❌ loadFromSupabase:', e); });
        }
    }, 100);
    setTimeout(function() { clearInterval(checkInterval); }, 10000);
})();

// ============================================
// Override de navigateTo para recarregar msgs
// ============================================
(function() {
    var waitNav = setInterval(function() {
        if (typeof navigateTo === 'function' && !window._navPatched) {
            window._navPatched = true;
            clearInterval(waitNav);
            var _origNav = navigateTo;
            window.navigateTo = function(page, params) {
                if (page === 'ticket-detail' && params && params.id) {
                    reloadMessagesFromSupabase(params.id).then(function() {
                        _origNav(page, params);
                    }).catch(function() {
                        _origNav(page, params);
                    });
                    return;
                }
                _origNav(page, params);
            };
            console.log('✅ navigateTo patched');
        }
    }, 100);
    setTimeout(function() { clearInterval(waitNav); }, 10000);
})();

console.log('✅ supabase-db.js v9 carregado');
