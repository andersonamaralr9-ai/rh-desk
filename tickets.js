// ============================================
// TICKETS - Gerenciamento de Chamados
// ============================================

let selectedFiles = [];

function handleFileSelect(input) {
    const files = Array.from(input.files);
    selectedFiles = [...selectedFiles, ...files];
    renderFileList();
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    renderFileList();
}

function renderFileList() {
    const container = document.getElementById('file-list');
    if (!container) return;

    if (selectedFiles.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = selectedFiles.map((file, i) => `
        <div class="file-item">
            <i class="fas fa-file" style="color:var(--primary)"></i>
            <span>${escapeHtml(file.name)}</span>
            <span style="color:var(--gray-400);font-size:11px;">(${(file.size / 1024).toFixed(1)} KB)</span>
            <span class="remove-file" onclick="removeFile(${i})"><i class="fas fa-times"></i></span>
        </div>
    `).join('');
}

async function submitTicket(event, serviceId) {
    event.preventDefault();

    const serviceInfo = db.getServiceById(serviceId);
    if (!serviceInfo) {
        showToast('Serviço não encontrado', 'error');
        return false;
    }

    const btn = document.getElementById('btn-submit-ticket');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    try {
        const formData = {};
        const fields = serviceInfo.formFields || ['description'];
        fields.forEach(field => {
            const el = document.getElementById(`field-${field}`);
            if (el) formData[field] = el.value;
        });

        const ticket = {
            subject: document.getElementById('ticket-subject').value,
            description: formData.description || '',
            priority: document.getElementById('ticket-priority').value,
            categoryId: serviceInfo.category.id,
            serviceId: serviceId,
            serviceName: serviceInfo.name,
            createdBy: currentUser.id,
            assignedTo: null,
            formData: formData,
            slaId: serviceInfo.slaId,
            attachments: []
        };

        if (selectedFiles.length > 0) {
            for (const file of selectedFiles) {
                const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                const path = `attachments/${fileName}`;

                if (db.useGitHub) {
                    try {
                        await githubAPI.uploadFile(path, file);
                        ticket.attachments.push({
                            name: file.name,
                            path: path,
                            size: file.size,
                            type: file.type,
                            uploadedAt: new Date().toISOString()
                        });
                    } catch (e) {
                        console.error('Erro no upload:', e);
                        ticket.attachments.push({
                            name: file.name,
                            path: path,
                            size: file.size,
                            type: file.type,
                            uploadedAt: new Date().toISOString(),
                            pendingUpload: true
                        });
                    }
                } else {
                    const reader = new FileReader();
                    const base64 = await new Promise((resolve) => {
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(file);
                    });
                    ticket.attachments.push({
                        name: file.name,
                        path: path,
                        size: file.size,
                        type: file.type,
                        data: base64,
                        uploadedAt: new Date().toISOString()
                    });
                }
            }
        }

        const newTicket = await db.addTicket(ticket);

        await db.addMessage({
            ticketId: newTicket.id,
            userId: currentUser.id,
            type: 'system',
            text: `Chamado ${newTicket.id} aberto - ${serviceInfo.name}`
        });

        if (formData.description) {
            await db.addMessage({
                ticketId: newTicket.id,
                userId: currentUser.id,
                type: 'message',
                text: formData.description
            });
        }

        selectedFiles = [];
        showToast(`Chamado ${newTicket.id} criado com sucesso!`, 'success');
        buildSidebar();
        navigateTo('ticket-detail', { id: newTicket.id });

    } catch (error) {
        console.error('Erro ao criar chamado:', error);
        showToast('Erro ao criar chamado. Tente novamente.', 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Chamado';
    return false;
}

function renderTicketDetail(container, ticketId) {
    const ticket = db.getTicketById(ticketId);
    if (!ticket) {
        showToast('Chamado não encontrado', 'error');
        navigateTo('my-tickets');
        return;
    }

    const category = db.getCategoryById(ticket.categoryId);
    const service = db.getServiceById(ticket.serviceId);
    const slaStatus = db.getSLAStatus(ticket);
    const createdByUser = db.getUserById(ticket.createdBy);
    const assignedUser = ticket.assignedTo ? db.getUserById(ticket.assignedTo) : null;
    const messages = db.getMessages(ticketId);
    const analysts = db.getUsers().filter(u => u.role === 'analyst' || u.role === 'admin');

    const canManage = isAnalyst();
    const isClosed = ticket.status === 'fechado' || ticket.status === 'cancelado';

    let html = `
        <div class="back-link" onclick="navigateTo('${isAnalyst() ? 'all-tickets' : 'my-tickets'}')">
            <i class="fas fa-arrow-left"></i> Voltar aos chamados
        </div>
        <div class="page-header">
            <h2><i class="fas fa-ticket-alt"></i> ${ticket.id}</h2>
            <div style="display:flex;gap:8px;">
                ${canManage && !isClosed ? `
                    <button class="btn btn-success btn-sm" onclick="changeTicketStatus('${ticket.id}','resolvido')">
                        <i class="fas fa-check"></i> Resolver
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="changeTicketStatus('${ticket.id}','fechado')">
                        <i class="fas fa-lock"></i> Fechar
                    </button>
                ` : ''}
                ${!canManage && ticket.status === 'resolvido' ? `
                    <button class="btn btn-success btn-sm" onclick="changeTicketStatus('${ticket.id}','fechado')">
                        <i class="fas fa-thumbs-up"></i> Confirmar Resolução
                    </button>
                    <button class="btn btn-warning btn-sm" onclick="changeTicketStatus('${ticket.id}','aberto')">
                        <i class="fas fa-redo"></i> Reabrir
                    </button>
                ` : ''}
            </div>
        </div>

        <div class="ticket-detail-grid">
            <div>
                <div class="card" style="margin-bottom:20px;">
                    <div class="card-header">
                        <h3><i class="fas fa-heading" style="color:var(--primary);margin-right:8px;"></i> ${escapeHtml(ticket.subject)}</h3>
                        <span class="status-badge status-${ticket.status}">${formatStatus(ticket.status)}</span>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header">
                        <h3><i class="fas fa-comments" style="color:var(--primary);margin-right:8px;"></i> Conversas</h3>
                    </div>
                    <div class="chat-container">
                        <div class="chat-messages" id="chat-messages">
                            ${renderChatMessages(messages, ticket)}
                        </div>
                        ${!isClosed ? `
                        <div class="chat-input-area">
                            <textarea id="chat-input" placeholder="Digite sua mensagem..." onkeydown="handleChatKeyDown(event, '${ticket.id}')"></textarea>
                            <div class="chat-input-actions">
                                <label class="btn btn-icon" title="Anexar arquivo" style="cursor:pointer">
                                    <i class="fas fa-paperclip"></i>
                                    <input type="file" style="display:none" onchange="sendFileMessage('${ticket.id}', this)">
                                </label>
                                <button class="btn btn-primary btn-sm" onclick="sendMessage('${ticket.id}')">
                                    <i class="fas fa-paper-plane"></i>
                                </button>
                            </div>
                        </div>
                        ` : `
                        <div style="padding:16px;text-align:center;color:var(--gray-400);font-size:14px;">
                            <i class="fas fa-lock"></i> Chamado encerrado
                        </div>
                        `}
                    </div>
                </div>

                <div class="card" style="margin-top:20px;">
                    <div class="card-header">
                        <h3><i class="fas fa-history" style="color:var(--gray-400);margin-right:8px;"></i> Histórico</h3>
                    </div>
                    <div class="card-body">
                        ${(ticket.history || []).slice().reverse().map(h => {
                            const histUser = db.getUserById(h.by);
                            return `<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100);">
                                <div style="width:32px;height:32px;border-radius:50%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                                    <i class="fas fa-clock" style="font-size:12px;color:var(--gray-500)"></i>
                                </div>
                                <div>
                                    <div style="font-size:14px;font-weight:500;">${escapeHtml(h.action)}</div>
                                    <div style="font-size:12px;color:var(--gray-400);">
                                        por ${histUser ? histUser.name : 'Sistema'} em ${formatDate(h.at)}
                                    </div>
                                    ${h.details ? `<div style="font-size:13px;color:var(--gray-600);margin-top:4px;">${escapeHtml(h.details)}</div>` : ''}
                                </div>
                            </div>`;
                        }).join('')}
                    </div>
                </div>
            </div>

            <div>
                <div class="card ticket-info-panel" style="margin-bottom:16px;">
                    <div class="card-header"><h3>Detalhes</h3></div>
                    <div class="card-body">
                        <div class="info-row">
                            <span class="label">Status</span>
                            <span class="status-badge status-${ticket.status}">${formatStatus(ticket.status)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Prioridade</span>
                            <span class="priority-badge priority-${ticket.priority}">${ticket.priority}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Categoria</span>
                            <span class="value">${category ? category.name : 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Serviço</span>
                            <span class="value">${ticket.serviceName || 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Solicitante</span>
                            <span class="value">${createdByUser ? createdByUser.name : 'N/A'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Atribuído a</span>
                            <span class="value">${assignedUser ? assignedUser.name : '<em style="color:var(--gray-400)">Não atribuído</em>'}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Criado em</span>
                            <span class="value">${formatDate(ticket.createdAt)}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">Atualizado</span>
                            <span class="value">${formatDate(ticket.updatedAt)}</span>
                        </div>

                        ${canManage && !isClosed ? `
                        <div style="margin-top:16px;">
                            <div class="form-group">
                                <label>Atribuir a:</label>
                                <select id="assign-analyst" onchange="assignTicket('${ticket.id}', this.value)">
                                    <option value="">Selecione...</option>
                                    ${analysts.map(a => `<option value="${a.id}" ${ticket.assignedTo === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Alterar Status:</label>
                                <select onchange="changeTicketStatus('${ticket.id}', this.value)">
                                    <option value="aberto" ${ticket.status === 'aberto' ? 'selected' : ''}>Aberto</option>
                                    <option value="em-andamento" ${ticket.status === 'em-andamento' ? 'selected' : ''}>Em Andamento</option>
                                    <option value="pendente" ${ticket.status === 'pendente' ? 'selected' : ''}>Pendente</option>
                                    <option value="resolvido" ${ticket.status === 'resolvido' ? 'selected' : ''}>Resolvido</option>
                                    <option value="fechado" ${ticket.status === 'fechado' ? 'selected' : ''}>Fechado</option>
                                    <option value="cancelado" ${ticket.status === 'cancelado' ? 'selected' : ''}>Cancelado</option>
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Alterar Prioridade:</label>
                                <select onchange="changeTicketPriority('${ticket.id}', this.value)">
                                    <option value="baixa" ${ticket.priority === 'baixa' ? 'selected' : ''}>Baixa</option>
                                    <option value="media" ${ticket.priority === 'media' ? 'selected' : ''}>Média</option>
                                    <option value="alta" ${ticket.priority === 'alta' ? 'selected' : ''}>Alta</option>
                                    <option value="critica" ${ticket.priority === 'critica' ? 'selected' : ''}>Crítica</option>
                                </select>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <div class="card" style="margin-bottom:16px;">
                    <div class="card-header"><h3>SLA</h3></div>
                    <div class="card-body">
                        <div class="sla-bar">
                            <div class="sla-bar-fill sla-${slaStatus.status}" style="width:${Math.min(100, slaStatus.percent)}%"></div>
                        </div>
                        <div class="sla-text">${slaStatus.text}</div>
                        <div style="margin-top:12px;font-size:13px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                                <span style="color:var(--gray-400)">Prazo SLA:</span>
                                <span>${ticket.slaHours || 'N/A'}h</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                                <span style="color:var(--gray-400)">Fins de semana:</span>
                                <span>${ticket.slaCountWeekends ? 'Sim' : 'Não'}</span>
                            </div>
                            <div style="display:flex;justify-content:space-between;">
                                <span style="color:var(--gray-400)">Vencimento:</span>
                                <span>${ticket.slaDeadline ? formatDate(ticket.slaDeadline) : 'N/A'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                ${ticket.attachments && ticket.attachments.length > 0 ? `
                <div class="card">
                    <div class="card-header"><h3>Anexos</h3></div>
                    <div class="card-body">
                        ${ticket.attachments.map(att => `
                            <div class="file-item" style="margin-bottom:6px;">
                                <i class="fas fa-file" style="color:var(--primary)"></i>
                                <a href="${db.useGitHub ? githubAPI.getDownloadUrl(att.path) : (att.data || '#')}"
                                   target="_blank" style="color:var(--primary);text-decoration:none;font-size:13px;">
                                    ${escapeHtml(att.name)}
                                </a>
                                <span style="color:var(--gray-400);font-size:11px;margin-left:auto;">
                                    ${(att.size / 1024).toFixed(1)} KB
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                ` : ''}
            </div>
        </div>
    `;

    container.innerHTML = html;

    const chatEl = document.getElementById('chat-messages');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

function renderChatMessages(messages, ticket) {
    if (messages.length === 0) {
        return `<div class="empty-state" style="padding:30px">
            <i class="fas fa-comments" style="font-size:32px"></i>
            <p>Nenhuma mensagem ainda</p>
        </div>`;
    }

    return messages.map(msg => {
        const msgUser = db.getUserById(msg.userId);
        const isOwn = msg.userId === currentUser.id;
        const isSystem = msg.type === 'system';

        if (isSystem) {
            return `<div class="chat-message system">
                <div class="chat-message-bubble">
                    <div class="msg-text"><i class="fas fa-info-circle"></i> ${escapeHtml(msg.text)}</div>
                    <div class="msg-time">${formatDate(msg.createdAt)}</div>
                </div>
            </div>`;
        }

        const avatarColor = isOwn ? 'var(--primary)' : 'var(--secondary)';
        const initial = msgUser ? msgUser.name.charAt(0).toUpperCase() : '?';

        let attachmentHtml = '';
        if (msg.attachment) {
            const downloadUrl = db.useGitHub ? githubAPI.getDownloadUrl(msg.attachment.path) : (msg.attachment.data || '#');
            attachmentHtml = `
                <a class="msg-attachment" href="${downloadUrl}" target="_blank">
                    <i class="fas fa-download"></i> ${escapeHtml(msg.attachment.name)}
                </a>`;
        }

        return `<div class="chat-message ${isOwn ? 'own' : ''}">
            <div class="chat-message-avatar" style="background:${avatarColor}">${initial}</div>
            <div class="chat-message-bubble">
                <div class="msg-author">${msgUser ? msgUser.name : 'Desconhecido'} ${msgUser && (msgUser.role === 'analyst' || msgUser.role === 'admin') ? '<span style="font-size:10px;opacity:0.7">● RH</span>' : ''}</div>
                <div class="msg-text">${escapeHtml(msg.text)}</div>
                ${attachmentHtml}
                <div class="msg-time">${formatDate(msg.createdAt)}</div>
            </div>
        </div>`;
    }).join('');
}

async function sendMessage(ticketId) {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';

    await db.addMessage({
        ticketId: ticketId,
        userId: currentUser.id,
        type: 'message',
        text: text
    });

    const ticket = db.getTicketById(ticketId);
    if (isAnalyst() && ticket.status === 'aberto') {
        await db.updateTicket(ticketId, { status: 'em-andamento' });
        await db.addTicketHistory(ticketId, 'Status alterado para Em Andamento', currentUser.id, 'Alterado automaticamente ao responder');
    }

    renderTicketDetail(document.getElementById('content'), ticketId);
}

function handleChatKeyDown(event, ticketId) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        sendMessage(ticketId);
    }
}

async function sendFileMessage(ticketId, input) {
    const file = input.files[0];
    if (!file) return;

    const fileName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const path = `attachments/${fileName}`;

    let attachment = {
        name: file.name,
        path: path,
        size: file.size,
        type: file.type
    };

    if (db.useGitHub) {
        try {
            await githubAPI.uploadFile(path, file);
        } catch (e) {
            console.error('Erro no upload:', e);
        }
    } else {
        const reader = new FileReader();
        const base64 = await new Promise((resolve) => {
            reader.onload = () => resolve(reader.result);
            reader.readAsDataURL(file);
        });
        attachment.data = base64;
    }

    await db.addMessage({
        ticketId: ticketId,
        userId: currentUser.id,
        type: 'message',
        text: `Arquivo anexado: ${file.name}`,
        attachment: attachment
    });

    showToast('Arquivo enviado!', 'success');
    renderTicketDetail(document.getElementById('content'), ticketId);
}

async function assignTicket(ticketId, analystId) {
    if (!analystId) return;

    const analyst = db.getUserById(analystId);
    await db.updateTicket(ticketId, { assignedTo: analystId });
    await db.addTicketHistory(ticketId, `Chamado atribuído a ${analyst ? analyst.name : analystId}`, currentUser.id);

    if (db.getTicketById(ticketId).status === 'aberto') {
        await db.updateTicket(ticketId, { status: 'em-andamento' });
        await db.addTicketHistory(ticketId, 'Status alterado para Em Andamento', currentUser.id);
    }

    await db.addMessage({
        ticketId: ticketId,
        userId: currentUser.id,
        type: 'system',
        text: `Chamado atribuído a ${analyst ? analyst.name : 'analista'}`
    });

    showToast('Chamado atribuído!', 'success');
    renderTicketDetail(document.getElementById('content'), ticketId);
}

async function changeTicketStatus(ticketId, newStatus) {
    const oldTicket = db.getTicketById(ticketId);
    const oldStatus = oldTicket.status;

    await db.updateTicket(ticketId, { status: newStatus });
    await db.addTicketHistory(ticketId, `Status alterado: ${formatStatus(oldStatus)} → ${formatStatus(newStatus)}`, currentUser.id);

    await db.addMessage({
        ticketId: ticketId,
        userId: currentUser.id,
        type: 'system',
        text: `Status alterado para ${formatStatus(newStatus)}`
    });

    buildSidebar();
    showToast(`Status alterado para ${formatStatus(newStatus)}`, 'success');
    renderTicketDetail(document.getElementById('content'), ticketId);
}

async function changeTicketPriority(ticketId, newPriority) {
    await db.updateTicket(ticketId, { priority: newPriority });
    await db.addTicketHistory(ticketId, `Prioridade alterada para ${newPriority}`, currentUser.id);

    showToast(`Prioridade alterada para ${newPriority}`, 'success');
    renderTicketDetail(document.getElementById('content'), ticketId);
}
