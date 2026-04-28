// ============================================
// SUPABASE-DB.JS v4 — Versão Robusta
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

    async select(table, columns = '*', filter = '') {
        try {
            const url = `${SUPABASE_URL}/rest/v1/${table}?select=${columns}${filter ? '&' + filter : ''}`;
            const res = await fetch(url, { headers: this.headers });
            if (!res.ok) {
                console.error(`SELECT ${table} falhou:`, res.status, await res.text());
                return [];
            }
            return await res.json();
        } catch(e) {
            console.error(`SELECT ${table} erro:`, e);
            return [];
        }
    },

    async insert(table, data) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const errText = await res.text();
                console.error(`INSERT ${table} falhou:`, res.status, errText);
                return null;
            }
            const result = await res.json();
            return result[0] || result;
        } catch(e) {
            console.error(`INSERT ${table} erro:`, e);
            return null;
        }
    },

    async update(table, id, data) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
                method: 'PATCH',
                headers: this.headers,
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const errText = await res.text();
                console.error(`UPDATE ${table} ${id} falhou:`, res.status, errText);
                return null;
            }
            const result = await res.json();
            return result[0] || result;
        } catch(e) {
            console.error(`UPDATE ${table} ${id} erro:`, e);
            return null;
        }
    },

    async remove(table, id) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
                method: 'DELETE',
                headers: this.headers
            });
            if (!res.ok) {
                console.error(`DELETE ${table} ${id} falhou:`, res.status);
                return false;
            }
            return true;
        } catch(e) {
            console.error(`DELETE ${table} ${id} erro:`, e);
            return false;
        }
    },

    async upsert(table, data) {
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
                method: 'POST',
                headers: { ...this.headers, 'Prefer': 'return=representation,resolution=merge-duplicates' },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                console.error(`UPSERT ${table} falhou:`, res.status, await res.text());
                return null;
            }
            return await res.json();
        } catch(e) {
            console.error(`UPSERT ${table} erro:`, e);
            return null;
        }
    }
};

// ============================================
// LOAD FROM SUPABASE
// ============================================
async function loadFromSupabase() {
    console.log('🔄 Carregando dados do Supabase...');
    let loaded = { users: false, tickets: false, messages: false, catalog: false, sla: false };

    // === USERS ===
    try {
        const users = await supaRest.select('users', '*');
        if (users && users.length > 0) {
            db.users = users.map(u => ({
                id: u.id,
                name: u.name,
                email: u.email,
                password: u.password,
                role: u.role,
                active: u.active,
                createdAt: u.created_at,
                allowedCategories: u.allowed_categories || []
            }));
            loaded.users = true;
            console.log(`✅ ${users.length} usuários carregados`);
        } else {
            console.warn('⚠️ Nenhum usuário no Supabase, mantendo localStorage');
        }
    } catch(e) {
        console.error('❌ Erro ao carregar usuários:', e);
    }

    // === TICKETS ===
    try {
        const tickets = await supaRest.select('tickets', '*', 'order=created_at.desc');
        if (tickets && tickets.length > 0) {
            db.tickets = tickets.map(t => ({
                id: t.id,
                subject: t.subject,
                title: t.subject, // alias para compatibilidade
                description: t.description,
                priority: t.priority,
                status: t.status,
                categoryId: t.category_id,
                serviceId: t.service_id,
                serviceName: t.service_name,
                createdBy: t.created_by,
                userId: t.created_by, // alias para compatibilidade
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
            }));
            loaded.tickets = true;
            console.log(`✅ ${tickets.length} tickets carregados`);
        } else {
            console.log('ℹ️ Nenhum ticket no Supabase');
        }
    } catch(e) {
        console.error('❌ Erro ao carregar tickets:', e);
    }

    // === MESSAGES ===
    try {
        const messages = await supaRest.select('messages', '*', 'order=created_at.asc');
        if (messages && messages.length > 0) {
            db.messages = messages.map(m => ({
                id: m.id,
                ticketId: m.ticket_id,
                userId: m.user_id,
                type: m.type,
                text: m.text,
                attachment: m.attachment || null,
                attachments: m.attachments || [],
                createdAt: m.created_at
            }));
            loaded.messages = true;
            console.log(`✅ ${messages.length} mensagens carregadas`);
        } else {
            console.log('ℹ️ Nenhuma mensagem no Supabase');
        }
    } catch(e) {
        console.error('❌ Erro ao carregar mensagens:', e);
    }

    // === CATALOG ===
    try {
        const catalog = await supaRest.select('catalog', '*');
        if (catalog && catalog.length > 0 && catalog[0].data) {
            const data = catalog[0].data;
            if (data.categories) {
                db.catalog = data;
            }
            loaded.catalog = true;
            console.log(`✅ Catálogo carregado (${data.categories ? data.categories.length : 0} categorias)`);
        }
    } catch(e) {
        console.error('❌ Erro ao carregar catálogo:', e);
    }

    // === SLA ===
    try {
        const sla = await supaRest.select('sla', '*');
        if (sla && sla.length > 0) {
            db.sla = sla.map(s => ({
                id: s.id,
                name: s.name,
                hours: s.hours,
                countWeekends: s.count_weekends,
                active: s.active
            }));
            loaded.sla = true;
            console.log(`✅ ${sla.length} SLAs carregados`);
        }
    } catch(e) {
        console.error('❌ Erro ao carregar SLA:', e);
    }

    // Salva no localStorage como backup
    try {
        if (loaded.users) localStorage.setItem('rh_desk_users', JSON.stringify(db.users));
        if (loaded.tickets) localStorage.setItem('rh_desk_tickets', JSON.stringify(db.tickets));
        if (loaded.messages) localStorage.setItem('rh_desk_messages', JSON.stringify(db.messages));
        if (loaded.catalog) localStorage.setItem('rh_desk_catalog', JSON.stringify(db.catalog));
        if (loaded.sla) localStorage.setItem('rh_desk_sla', JSON.stringify(db.sla));
    } catch(e) {
        console.error('Erro ao salvar localStorage:', e);
    }

    console.log('✅ loadFromSupabase concluído:', loaded);
    return loaded;
}

// ============================================
// OVERRIDE: db.getMessages
// ============================================
if (typeof db !== 'undefined') {
    db.getMessages = function(ticketId) {
        return (db.messages || []).filter(m => m.ticketId === ticketId);
    };
}

// ============================================
// OVERRIDE: db.addUser
// ============================================
if (typeof db !== 'undefined') {
    const _origAddUser = db.addUser ? db.addUser.bind(db) : null;
    db.addUser = async function(user) {
        // Adiciona localmente
        if (_origAddUser) _origAddUser(user);
        else db.users.push(user);

        // Salva no Supabase
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
            console.log(`✅ Usuário ${user.id} salvo no Supabase`);
        } catch(e) {
            console.error(`❌ Erro ao salvar usuário ${user.id}:`, e);
        }

        localStorage.setItem('rh_desk_users', JSON.stringify(db.users));
    };
}

// ============================================
// OVERRIDE: db.updateUser
// ============================================
if (typeof db !== 'undefined') {
    db.updateUser = async function(userId, updates) {
        const user = db.users.find(u => u.id === userId);
        if (!user) return;

        Object.assign(user, updates);

        // Monta objeto para Supabase (camelCase → snake_case)
        const supaUpdates = {};
        if (updates.name !== undefined) supaUpdates.name = updates.name;
        if (updates.email !== undefined) supaUpdates.email = updates.email;
        if (updates.password !== undefined) supaUpdates.password = updates.password;
        if (updates.role !== undefined) supaUpdates.role = updates.role;
        if (updates.active !== undefined) supaUpdates.active = updates.active;
        if (updates.allowedCategories !== undefined) supaUpdates.allowed_categories = updates.allowedCategories;

        try {
            await supaRest.update('users', userId, supaUpdates);
            console.log(`✅ Usuário ${userId} atualizado no Supabase`);
        } catch(e) {
            console.error(`❌ Erro ao atualizar usuário ${userId}:`, e);
        }

        localStorage.setItem('rh_desk_users', JSON.stringify(db.users));
    };
}

// ============================================
// OVERRIDE: db.deleteUser
// ============================================
if (typeof db !== 'undefined') {
    db.deleteUser = async function(userId) {
        db.users = db.users.filter(u => u.id !== userId);

        try {
            await supaRest.remove('users', userId);
            console.log(`✅ Usuário ${userId} removido do Supabase`);
        } catch(e) {
            console.error(`❌ Erro ao remover usuário ${userId}:`, e);
        }

        localStorage.setItem('rh_desk_users', JSON.stringify(db.users));
    };
}

// ============================================
// OVERRIDE: db.addTicket
// ============================================
if (typeof db !== 'undefined') {
    db.addTicket = async function(ticket) {
        // Adiciona localmente com aliases
        const localTicket = {
            ...ticket,
            title: ticket.subject || ticket.title,
            subject: ticket.subject || ticket.title,
            userId: ticket.createdBy || ticket.userId,
            createdBy: ticket.createdBy || ticket.userId
        };
        db.tickets.push(localTicket);

        // Monta para Supabase
        const supaTicket = {
            id: ticket.id,
            subject: ticket.subject || ticket.title,
            description: ticket.description,
            priority: ticket.priority || 'media',
            status: ticket.status || 'aberto',
            category_id: ticket.categoryId,
            service_id: ticket.serviceId,
            service_name: ticket.serviceName || null,
            created_by: ticket.createdBy || ticket.userId,
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
        };

        try {
            await supaRest.insert('tickets', supaTicket);
            console.log(`✅ Ticket ${ticket.id} salvo no Supabase`);
        } catch(e) {
            console.error(`❌ Erro ao salvar ticket ${ticket.id}:`, e);
        }

        localStorage.setItem('rh_desk_tickets', JSON.stringify(db.tickets));
        return localTicket;
    };
}

// ============================================
// OVERRIDE: db.updateTicket
// ============================================
if (typeof db !== 'undefined') {
    db.updateTicket = async function(ticketId, updates) {
        const ticket = db.tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        Object.assign(ticket, updates);
        // Mantém aliases sincronizados
        if (updates.subject) ticket.title = updates.subject;
        if (updates.title) ticket.subject = updates.title;
        if (updates.createdBy) ticket.userId = updates.createdBy;
        if (updates.userId) ticket.createdBy = updates.userId;

        // Monta snake_case para Supabase
        const supaUpdates = {};
        const mapping = {
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

        for (const [key, val] of Object.entries(updates)) {
            if (mapping[key]) supaUpdates[mapping[key]] = val;
        }

        if (Object.keys(supaUpdates).length > 0) {
            try {
                await supaRest.update('tickets', ticketId, supaUpdates);
                console.log(`✅ Ticket ${ticketId} atualizado no Supabase`);
            } catch(e) {
                console.error(`❌ Erro ao atualizar ticket ${ticketId}:`, e);
            }
        }

        localStorage.setItem('rh_desk_tickets', JSON.stringify(db.tickets));
    };
}

// ============================================
// OVERRIDE: db.addTicketHistory
// ============================================
if (typeof db !== 'undefined') {
    db.addTicketHistory = async function(ticketId, entry) {
        const ticket = db.tickets.find(t => t.id === ticketId);
        if (!ticket) return;

        if (!ticket.history) ticket.history = [];
        ticket.history.push(entry);

        try {
            await supaRest.update('tickets', ticketId, {
                history: ticket.history,
                updated_at: new Date().toISOString()
            });
        } catch(e) {
            console.error(`❌ Erro ao adicionar histórico ao ticket ${ticketId}:`, e);
        }

        localStorage.setItem('rh_desk_tickets', JSON.stringify(db.tickets));
    };
}

// ============================================
// OVERRIDE: db.addMessage
// ============================================
if (typeof db !== 'undefined') {
    db.addMessage = async function(msg) {
        const msgId = msg.id || ('MSG' + String((db.messages || []).length + 1).padStart(5, '0'));
        const now = new Date().toISOString();

        const localMsg = {
            id: msgId,
            ticketId: msg.ticketId,
            userId: msg.userId,
            type: msg.type || 'message',
            text: msg.text || '',
            attachment: msg.attachment || null,
            attachments: msg.attachments || [],
            createdAt: msg.createdAt || now
        };

        if (!db.messages) db.messages = [];
        db.messages.push(localMsg);

        // Upload de anexos para Supabase Storage se existirem
        let uploadedAttachments = [];
        if (localMsg.attachments && localMsg.attachments.length > 0) {
            for (const att of localMsg.attachments) {
                // Se já é URL, mantém
                if (typeof att === 'string' && att.startsWith('http')) {
                    uploadedAttachments.push(att);
                } else if (att && att.data) {
                    // Tenta upload para Storage
                    try {
                        const fileName = `messages/${msgId}/${Date.now()}_${att.name || 'file'}`;
                        const blob = att.data instanceof Blob ? att.data : 
                                     (typeof att.data === 'string' ? await fetch(att.data).then(r => r.blob()) : null);
                        if (blob) {
                            const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/attachments/${fileName}`, {
                                method: 'POST',
                                headers: {
                                    'apikey': SUPABASE_KEY,
                                    'Authorization': `Bearer ${SUPABASE_KEY}`,
                                    'Content-Type': blob.type || 'application/octet-stream'
                                },
                                body: blob
                            });
                            if (uploadRes.ok) {
                                uploadedAttachments.push(`${SUPABASE_URL}/storage/v1/object/public/attachments/${fileName}`);
                            } else {
                                uploadedAttachments.push(att);
                            }
                        } else {
                            uploadedAttachments.push(att);
                        }
                    } catch(e) {
                        console.error('Erro upload anexo:', e);
                        uploadedAttachments.push(att);
                    }
                } else {
                    uploadedAttachments.push(att);
                }
            }
        }

        // Salva mensagem no Supabase
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
            console.log(`✅ Mensagem ${msgId} salva no Supabase`);
        } catch(e) {
            console.error(`❌ Erro ao salvar mensagem ${msgId}:`, e);
        }

        localStorage.setItem('rh_desk_messages', JSON.stringify(db.messages));
        return localMsg;
    };
}

// ============================================
// CATALOG MANAGEMENT
// ============================================
async function saveCatalogToSupabase() {
    try {
        await supaRest.upsert('catalog', { id: 1, data: db.catalog });
        console.log('✅ Catálogo salvo no Supabase');
    } catch(e) {
        console.error('❌ Erro ao salvar catálogo:', e);
    }
}

if (typeof db !== 'undefined') {
    db.addCategory = async function(cat) {
        if (!db.catalog) db.catalog = { categories: [] };
        if (!db.catalog.categories) db.catalog.categories = [];
        db.catalog.categories.push(cat);
        await saveCatalogToSupabase();
        localStorage.setItem('rh_desk_catalog', JSON.stringify(db.catalog));
    };

    db.updateCategory = async function(catId, updates) {
        const cat = (db.catalog?.categories || []).find(c => c.id === catId);
        if (cat) Object.assign(cat, updates);
        await saveCatalogToSupabase();
        localStorage.setItem('rh_desk_catalog', JSON.stringify(db.catalog));
    };

    db.deleteCategory = async function(catId) {
        if (db.catalog?.categories) {
            db.catalog.categories = db.catalog.categories.filter(c => c.id !== catId);
        }
        await saveCatalogToSupabase();
        localStorage.setItem('rh_desk_catalog', JSON.stringify(db.catalog));
    };

    db.addService = async function(catId, service) {
        const cat = (db.catalog?.categories || []).find(c => c.id === catId);
        if (cat) {
            if (!cat.services) cat.services = [];
            cat.services.push(service);
        }
        await saveCatalogToSupabase();
        localStorage.setItem('rh_desk_catalog', JSON.stringify(db.catalog));
    };

    db.updateService = async function(catId, serviceId, updates) {
        const cat = (db.catalog?.categories || []).find(c => c.id === catId);
        if (cat) {
            const svc = (cat.services || []).find(s => s.id === serviceId);
            if (svc) Object.assign(svc, updates);
        }
        await saveCatalogToSupabase();
        localStorage.setItem('rh_desk_catalog', JSON.stringify(db.catalog));
    };

    db.deleteService = async function(catId, serviceId) {
        const cat = (db.catalog?.categories || []).find(c => c.id === catId);
        if (cat && cat.services) {
            cat.services = cat.services.filter(s => s.id !== serviceId);
        }
        await saveCatalogToSupabase();
        localStorage.setItem('rh_desk_catalog', JSON.stringify(db.catalog));
    };

    // Helper para obter categorias (usado por features.js)
    db.getCategories = function() {
        return db.catalog?.categories || [];
    };

    // Helper para obter serviços de uma categoria
    db.getServices = function(catId) {
        const cat = (db.catalog?.categories || []).find(c => c.id === catId);
        return cat?.services || [];
    };
}

// ============================================
// SLA MANAGEMENT
// ============================================
if (typeof db !== 'undefined') {
    db.addSLA = async function(sla) {
        if (!db.sla) db.sla = [];
        db.sla.push(sla);
        try {
            await supaRest.insert('sla', {
                id: sla.id,
                name: sla.name,
                hours: sla.hours,
                count_weekends: sla.countWeekends || false,
                active: sla.active !== false
            });
        } catch(e) { console.error('Erro ao salvar SLA:', e); }
        localStorage.setItem('rh_desk_sla', JSON.stringify(db.sla));
    };

    db.updateSLA = async function(slaId, updates) {
        const sla = (db.sla || []).find(s => s.id === slaId);
        if (sla) Object.assign(sla, updates);
        const supaUpdates = {};
        if (updates.name !== undefined) supaUpdates.name = updates.name;
        if (updates.hours !== undefined) supaUpdates.hours = updates.hours;
        if (updates.countWeekends !== undefined) supaUpdates.count_weekends = updates.countWeekends;
        if (updates.active !== undefined) supaUpdates.active = updates.active;
        try {
            await supaRest.update('sla', slaId, supaUpdates);
        } catch(e) { console.error('Erro ao atualizar SLA:', e); }
        localStorage.setItem('rh_desk_sla', JSON.stringify(db.sla));
    };

    db.deleteSLA = async function(slaId) {
        db.sla = (db.sla || []).filter(s => s.id !== slaId);
        try {
            await supaRest.remove('sla', slaId);
        } catch(e) { console.error('Erro ao remover SLA:', e); }
        localStorage.setItem('rh_desk_sla', JSON.stringify(db.sla));
    };
}

// ============================================
// ADMIN UI: CONFIGURAÇÕES SUPABASE
// ============================================
function renderAdminSettings() {
    const content = document.getElementById('content') || document.querySelector('.content-area');
    if (!content) return;

    const userCount = (db.users || []).length;
    const ticketCount = (db.tickets || []).length;
    const catCount = (db.catalog?.categories || []).length;
    const msgCount = (db.messages || []).length;

    content.innerHTML = `
        <div style="padding:20px;">
            <h2><i class="fas fa-cog"></i> Configurações</h2>
            <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:15px;margin:15px 0;">
                <p><strong>✅ Supabase conectado</strong></p>
                <p style="color:#666;font-size:13px;">Projeto: fnihosrvwitlnnlcarpf</p>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:15px;margin:15px 0;">
                <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;text-align:center;">
                    <div style="font-size:24px;font-weight:bold;color:#3b82f6;">${userCount}</div>
                    <div style="color:#666;">Usuários</div>
                </div>
                <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;text-align:center;">
                    <div style="font-size:24px;font-weight:bold;color:#10b981;">${ticketCount}</div>
                    <div style="color:#666;">Chamados</div>
                </div>
                <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;text-align:center;">
                    <div style="font-size:24px;font-weight:bold;color:#8b5cf6;">${catCount}</div>
                    <div style="color:#666;">Categorias</div>
                </div>
                <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:15px;text-align:center;">
                    <div style="font-size:24px;font-weight:bold;color:#f59e0b;">${msgCount}</div>
                    <div style="color:#666;">Mensagens</div>
                </div>
            </div>
            <button onclick="reloadFromSupabase()" style="background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;">
                <i class="fas fa-sync"></i> Recarregar do Supabase
            </button>
        </div>
    `;
}

async function reloadFromSupabase() {
    showToast('Recarregando dados do Supabase...', 'info');
    await loadFromSupabase();
    showToast('Dados recarregados com sucesso!', 'success');
    renderAdminSettings();
}

console.log('✅ supabase-db.js v4 carregado (robusto, com created_by/subject)');
