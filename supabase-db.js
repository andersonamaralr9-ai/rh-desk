// ============================================
// SUPABASE-DB.JS v7 — Final limpo
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
// Helper
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
// OVERRIDES — Wrap originais + sync Supabase
// ============================================
(function() {
    // addTicket
    var _origAddTicket = db.addTicket.bind(db);
    db.addTicket = async function(ticket) {
        var result = await _origAddTicket(ticket);
        if (result && result.id) {
            try { await supaRest.insert('tickets', ticketToSupabase(result)); console.log('✅ Ticket ' + result.id + ' → Supabase'); }
            catch(e) { console.error('❌ Ticket Supabase:', e); }
        }
        return result;
    };

    // updateTicket
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

    // addTicketHistory
    var _origAddTicketHistory = db.addTicketHistory.bind(db);
    db.addTicketHistory = async function(ticketId, action, userId, details) {
        await _origAddTicketHistory(ticketId, action, userId, details);
        var ticket = db.getTicketById(ticketId);
        if (ticket) {
            try { await supaRest.update('tickets', ticketId, { history: ticket.history, updated_at: ticket.updatedAt }); } catch(e) {}
        }
    };

    // addMessage
    var _origAddMessage = db.addMessage.bind(db);
    db.addMessage = async function(message) {
        var result = await _origAddMessage(message);
        if (result && result.id) {
            try {
                await supaRest.insert('messages', {
                    id: result.id, ticket_id: result.ticketId, user_id: result.userId,
                    type: result.type || 'message', text: result.text || '',
                    attachments: result.attachments || [], created_at: result.createdAt
                });
                console.log('✅ Msg ' + result.id + ' → Supabase');
            } catch(e) { console.error('❌ Msg Supabase:', e); }
        }
        return result;
    };

    // addUser
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
            } catch(e) { console.error('❌ User Supabase:', e); }
        }
        return result;
    };

    // updateUser
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

    // deleteUser
    var _origDeleteUser = db.deleteUser.bind(db);
    db.deleteUser = async function(id) {
        await _origDeleteUser(id);
        try { await supaRest.update('users', id, { active: false }); } catch(e) {}
    };

    // syncToGitHub — also sync to Supabase
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
})();

// ============================================
// saveCatalogToSupabase (usado pelo features.js)
// ============================================
async function saveCatalogToSupabase() {
    try { await supaRest.upsert('catalog', { id: 1, data: db.data.catalog }); }
    catch(e) { console.error('❌ Catálogo:', e); }
}

// ============================================
// reloadFromSupabase
// ============================================
async function reloadFromSupabase() {
    showToast('Recarregando...', 'info');
    await loadFromSupabase();
    showToast('Dados recarregados!', 'success');
}

// ============================================
// SUPABASE STORAGE — Upload e Download de Anexos
// ============================================

var STORAGE_BUCKET = 'rhdesk-attachments';

// Converte base64 data URL para File/Blob
function dataURLtoBlob(dataURL) {
    try {
        var parts = dataURL.split(',');
        var mime = parts[0].match(/:(.*?);/)[1];
        var bstr = atob(parts[1]);
        var n = bstr.length;
        var u8arr = new Uint8Array(n);
        for (var i = 0; i < n; i++) {
            u8arr[i] = bstr.charCodeAt(i);
        }
        return new Blob([u8arr], { type: mime });
    } catch (e) {
        console.error('Erro ao converter base64 para Blob:', e);
        return null;
    }
}

// Upload de arquivo para Supabase Storage
// Retorna a URL pública ou null em caso de erro
async function uploadToSupabaseStorage(file, ticketId, messageId) {
    try {
        var blob, fileName, ext;

        if (typeof file === 'string' && file.startsWith('data:')) {
            // É um base64 data URL
            blob = dataURLtoBlob(file);
            if (!blob) return null;
            var mimeToExt = {
                'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif',
                'image/webp': 'webp', 'application/pdf': 'pdf',
                'text/plain': 'txt', 'text/csv': 'csv',
                'application/zip': 'zip',
                'application/msword': 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
                'application/vnd.ms-excel': 'xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx'
            };
            ext = mimeToExt[blob.type] || 'bin';
            fileName = ticketId + '/' + messageId + '_' + Date.now() + '.' + ext;
        } else if (file instanceof File || file instanceof Blob) {
            blob = file;
            var originalName = file.name || ('file_' + Date.now());
            fileName = ticketId + '/' + messageId + '_' + originalName;
        } else {
            console.warn('Tipo de arquivo não suportado para upload:', typeof file);
            return null;
        }

        // Upload via REST API
        var url = SUPABASE_URL + '/storage/v1/object/' + STORAGE_BUCKET + '/' + encodeURIComponent(fileName);
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
            var errText = await response.text();
            console.error('Erro no upload Storage:', response.status, errText);
            return null;
        }

        // Retorna URL pública
        var publicURL = SUPABASE_URL + '/storage/v1/object/public/' + STORAGE_BUCKET + '/' + fileName;
        console.log('✅ Upload concluído:', publicURL);
        return publicURL;

    } catch (e) {
        console.error('Erro no uploadToSupabaseStorage:', e);
        return null;
    }
}

// Gera link de download para um anexo
function getAttachmentDownloadURL(attachmentData) {
    if (!attachmentData) return null;

    // Se já é uma URL pública do Supabase Storage
    if (typeof attachmentData === 'string' && attachmentData.startsWith('http')) {
        return attachmentData;
    }

    // Se é um objeto com url
    if (typeof attachmentData === 'object' && attachmentData.url) {
        if (attachmentData.url.startsWith('http')) return attachmentData.url;
        if (attachmentData.url.startsWith('data:')) return attachmentData.url; // fallback base64
    }

    // Se é base64 (fallback local)
    if (typeof attachmentData === 'string' && attachmentData.startsWith('data:')) {
        return attachmentData;
    }

    return null;
}

// Tornar funções globais
window.uploadToSupabaseStorage = uploadToSupabaseStorage;
window.getAttachmentDownloadURL = getAttachmentDownloadURL;
window.dataURLtoBlob = dataURLtoBlob;

// ============================================
// OVERRIDE de db.addMessage para fazer upload de anexos
// ============================================
(function() {
    var _origAddMessage = db.addMessage;
    db.addMessage = async function(ticketId, userId, type, text, attachment) {
        // Chamar a função original primeiro (gera ID, salva em db.data.messages)
        var msg = _origAddMessage.call(db, ticketId, userId, type, text, attachment);
        if (!msg) return msg;

        try {
            var attachmentURL = null;
            var attachmentsArray = [];

            // Se tem attachment, fazer upload para Storage
            if (attachment) {
                var dataToUpload = null;

                if (typeof attachment === 'string' && attachment.startsWith('data:')) {
                    dataToUpload = attachment;
                } else if (typeof attachment === 'object' && attachment.data) {
                    dataToUpload = attachment.data;
                } else if (typeof attachment === 'object' && attachment.url && attachment.url.startsWith('data:')) {
                    dataToUpload = attachment.url;
                }

                if (dataToUpload) {
                    var uploadedURL = await uploadToSupabaseStorage(dataToUpload, ticketId, msg.id);
                    if (uploadedURL) {
                        attachmentURL = uploadedURL;
                        attachmentsArray = [{
                            name: attachment.name || attachment.fileName || 'arquivo',
                            url: uploadedURL,
                            type: attachment.type || attachment.mimeType || 'application/octet-stream',
                            size: attachment.size || 0
                        }];

                        // Atualizar o objeto local também para exibição imediata
                        var localMsg = (db.data.messages || []).find(function(m) { return m.id === msg.id; });
                        if (localMsg) {
                            localMsg.attachment = {
                                name: attachment.name || attachment.fileName || 'arquivo',
                                url: uploadedURL,
                                type: attachment.type || attachment.mimeType || 'application/octet-stream',
                                size: attachment.size || 0
                            };
                        }
                    }
                }
            }

            // Sincronizar com Supabase
            await supaRest.insert('messages', {
                id: msg.id,
                ticket_id: ticketId,
                user_id: userId,
                type: type || 'message',
                text: text || '',
                attachment: attachmentURL,
                attachments: attachmentsArray,
                created_at: msg.createdAt || new Date().toISOString()
            });
            console.log('✅ Mensagem sincronizada com Supabase:', msg.id);

        } catch (e) {
            console.error('Erro ao sincronizar mensagem com Supabase:', e);
        }

        return msg;
    };
})();

// ============================================
// Patch para renderizar anexos com links funcionais
// ============================================
(function() {
    // Monitorar o DOM para substituir links de anexos quebrados
    var attachmentObserver = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            mutation.addedNodes.forEach(function(node) {
                if (node.nodeType !== 1) return;

                // Encontrar links de anexo/download dentro do nó adicionado
                var links = node.querySelectorAll ? node.querySelectorAll('a[download], .attachment-link, .chat-attachment a, .message-attachment a') : [];
                links.forEach(function(link) {
                    var href = link.getAttribute('href');
                    // Se o link é "#" ou vazio ou blob:, tentar corrigir
                    if (!href || href === '#' || href === 'javascript:void(0)') {
                        // Procurar o messageId mais próximo
                        var msgEl = link.closest('[data-message-id]') || link.closest('.chat-message') || link.closest('.message');
                        if (msgEl) {
                            var msgId = msgEl.getAttribute('data-message-id') || msgEl.dataset.messageId;
                            if (msgId) {
                                var msgData = (db.data.messages || []).find(function(m) { return m.id === msgId; });
                                if (msgData && msgData.attachment) {
                                    var url = getAttachmentDownloadURL(msgData.attachment);
                                    if (url) {
                                        link.setAttribute('href', url);
                                        link.setAttribute('target', '_blank');
                                        link.removeAttribute('download');
                                        console.log('🔗 Link de anexo corrigido para mensagem:', msgId);
                                    }
                                }
                            }
                        }
                    }
                });

                // Também verificar imagens com src base64 que poderiam ser links
                var imgs = node.querySelectorAll ? node.querySelectorAll('img[data-attachment]') : [];
                imgs.forEach(function(img) {
                    var msgEl = img.closest('[data-message-id]');
                    if (msgEl) {
                        var msgId = msgEl.getAttribute('data-message-id');
                        var msgData = (db.data.messages || []).find(function(m) { return m.id === msgId; });
                        if (msgData && msgData.attachment) {
                            var url = getAttachmentDownloadURL(msgData.attachment);
                            if (url && url.startsWith('http')) {
                                img.src = url;
                            }
                        }
                    }
                });
            });
        });
    });

    // Observar mudanças no DOM
    if (document.body) {
        attachmentObserver.observe(document.body, { childList: true, subtree: true });
    } else {
        document.addEventListener('DOMContentLoaded', function() {
            attachmentObserver.observe(document.body, { childList: true, subtree: true });
        });
    }
    console.log('✅ Observer de anexos ativado');
})();

// ============================================
// Função para recarregar mensagens do Supabase com anexos
// ============================================
async function reloadMessagesFromSupabase(ticketId) {
    try {
        var freshMsgs = await supaRest.select('messages', '*', 'ticket_id=eq.' + ticketId + '&order=created_at.asc');
        if (freshMsgs && freshMsgs.length) {
            // Remover mensagens antigas deste ticket
            db.data.messages = (db.data.messages || []).filter(function(m) { return m.ticketId !== ticketId; });
            // Adicionar mensagens frescas
            freshMsgs.forEach(function(m) {
                var attachmentData = null;
                // Reconstruir attachment a partir da URL do Storage
                if (m.attachment && typeof m.attachment === 'string' && m.attachment.startsWith('http')) {
                    attachmentData = {
                        url: m.attachment,
                        name: (m.attachments && m.attachments[0] && m.attachments[0].name) || 'arquivo',
                        type: (m.attachments && m.attachments[0] && m.attachments[0].type) || 'application/octet-stream',
                        size: (m.attachments && m.attachments[0] && m.attachments[0].size) || 0
                    };
                } else if (m.attachments && m.attachments.length > 0 && m.attachments[0].url) {
                    attachmentData = m.attachments[0];
                }

                db.data.messages.push({
                    id: m.id,
                    ticketId: m.ticket_id,
                    userId: m.user_id,
                    type: m.type,
                    text: m.text,
                    attachment: attachmentData,
                    attachments: m.attachments || [],
                    createdAt: m.created_at
                });
            });
            console.log('✅ Mensagens recarregadas do Supabase para ticket:', ticketId, '(' + freshMsgs.length + ' msgs)');
        }
    } catch (e) {
        console.error('Erro ao recarregar mensagens:', e);
    }
}

window.reloadMessagesFromSupabase = reloadMessagesFromSupabase;


console.log('✅ supabase-db.js v7 carregado');
