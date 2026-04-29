// ============================================
// GITHUB API
// ============================================
class GitHubAPI {
    constructor() {
        this.token = '';
        this.owner = '';
        this.repo = '';
        this.baseUrl = 'https://api.github.com';
        this.branch = 'main';
        this.shaCache = {};
    }
    configure(token, owner, repo) {
        this.token = token;
        this.owner = owner;
        this.repo = repo;
    }
    get headers() {
        return {
            'Authorization': 'Bearer ' + this.token,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        };
    }
    async getFile(path) {
        try {
            const response = await fetch(
                this.baseUrl + '/repos/' + this.owner + '/' + this.repo + '/contents/' + path + '?ref=' + this.branch,
                { headers: this.headers }
            );
            if (response.status === 404) return null;
            if (!response.ok) throw new Error('GitHub API Error: ' + response.status);
            const data = await response.json();
            this.shaCache[path] = data.sha;
            const content = atob(data.content.replace(/\n/g, ''));
            const bytes = new Uint8Array(content.length);
            for (let i = 0; i < content.length; i++) bytes[i] = content.charCodeAt(i);
            return new TextDecoder('utf-8').decode(bytes);
        } catch (error) {
            console.error('Erro ao ler ' + path + ':', error);
            return null;
        }
    }
    async saveFile(path, content, message) {
        message = message || 'Update data';
        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(content);
            let binary = '';
            for (let i = 0; i < data.length; i++) binary += String.fromCharCode(data[i]);
            const base64Content = btoa(binary);
            const body = { message: message, content: base64Content, branch: this.branch };
            if (this.shaCache[path]) {
                body.sha = this.shaCache[path];
            } else {
                await this.getFile(path);
                if (this.shaCache[path]) body.sha = this.shaCache[path];
            }
            const response = await fetch(
                this.baseUrl + '/repos/' + this.owner + '/' + this.repo + '/contents/' + path,
                { method: 'PUT', headers: this.headers, body: JSON.stringify(body) }
            );
            if (!response.ok) throw new Error('GitHub API Error: ' + response.status);
            const result = await response.json();
            this.shaCache[path] = result.content.sha;
            return result;
        } catch (error) {
            console.error('Erro ao salvar ' + path + ':', error);
            throw error;
        }
    }
    async uploadFile(path, file) {
        return new Promise(function(resolve, reject) {
            const reader = new FileReader();
            reader.onload = async function() {
                try {
                    const base64 = reader.result.split(',')[1];
                    const body = { message: 'Upload: ' + file.name, content: base64, branch: githubAPI.branch };
                    if (githubAPI.shaCache[path]) body.sha = githubAPI.shaCache[path];
                    const response = await fetch(
                        githubAPI.baseUrl + '/repos/' + githubAPI.owner + '/' + githubAPI.repo + '/contents/' + path,
                        { method: 'PUT', headers: githubAPI.headers, body: JSON.stringify(body) }
                    );
                    if (!response.ok) throw new Error('Upload failed: ' + response.status);
                    const result = await response.json();
                    githubAPI.shaCache[path] = result.content.sha;
                    resolve(result);
                } catch (error) { reject(error); }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }
    getDownloadUrl(path) {
        return 'https://raw.githubusercontent.com/' + this.owner + '/' + this.repo + '/' + this.branch + '/' + path;
    }
    async testConnection() {
        try {
            const response = await fetch(this.baseUrl + '/repos/' + this.owner + '/' + this.repo, { headers: this.headers });
            return response.ok;
        } catch (e) { return false; }
    }
    async initializeRepo() {
        var defaultUsers = JSON.stringify([{
            id: 'USR001', name: 'Administrador', email: 'admin@empresa.com',
            password: 'admin123', role: 'admin', active: true, createdAt: new Date().toISOString()
        }], null, 2);
        var files = {
            'db/users.json': defaultUsers,
            'db/tickets.json': '[]',
            'db/catalog.json': JSON.stringify(db.data.catalog, null, 2),
            'db/sla.json': JSON.stringify(db.data.sla, null, 2),
            'db/messages.json': '[]'
        };
        for (var path in files) {
            try {
                await this.saveFile(path, files[path], 'Initialize ' + path);
                console.log('Criado: ' + path);
            } catch (e) { console.log(path + ' erro:', e.message); }
        }
    }
}
var githubAPI = new GitHubAPI();

// ============================================
// DATABASE
// ============================================
class Database {
    constructor() {
        this.data = { users: [], tickets: [], catalog: { categories: [] }, sla: [], messages: [] };
        this.syncQueue = [];
        this.isSyncing = false;
        this.useGitHub = false;
        this.lastSync = null;
    }
    async init() {
        this.loadFromLocal();
        if (githubAPI.token) {
            this.useGitHub = true;
            try { await this.syncFromGitHub(); } catch (e) { console.warn('Offline:', e); }
        }
        if (!this.data.users || this.data.users.length === 0) {
            this.createDefaultData();
            this.saveToLocal();
        }
        if (!this.data.catalog || !this.data.catalog.categories || this.data.catalog.categories.length === 0) {
            this.createDefaultCatalog();
            this.saveToLocal();
        }
        if (!this.data.sla || this.data.sla.length === 0) {
            this.createDefaultSLA();
            this.saveToLocal();
        }
    }
    createDefaultData() {
        this.data.users = [{
            id: 'USR001', name: 'Administrador', email: 'admin@empresa.com',
            password: 'admin123', role: 'admin', active: true, createdAt: new Date().toISOString()
        }];
        this.data.tickets = [];
        this.data.messages = [];
        this.createDefaultSLA();
        this.createDefaultCatalog();
    }
    createDefaultSLA() {
        this.data.sla = [
            { id: 'SLA001', name: 'Padrao', hours: 48, countWeekends: false, active: true },
            { id: 'SLA002', name: 'Intermediario', hours: 72, countWeekends: false, active: true },
            { id: 'SLA003', name: 'Longo', hours: 120, countWeekends: false, active: true },
            { id: 'SLA004', name: 'Urgente', hours: 24, countWeekends: true, active: true }
        ];
    }
    createDefaultCatalog() {
        this.data.catalog = { categories: [
            { id: 'CAT001', name: 'Folha de Pagamento', description: 'Contracheques e remuneracao', icon: 'fa-money-bill-wave', color: '#059669', active: true, services: [
                { id: 'SRV001', name: 'Duvida sobre contracheque', description: 'Esclarecimentos sobre valores', formFields: ['description'], slaId: 'SLA001', active: true },
                { id: 'SRV002', name: 'Correcao de pagamento', description: 'Correcao de valores pagos', formFields: ['description', 'monthRef', 'amount'], slaId: 'SLA002', active: true },
                { id: 'SRV003', name: 'Informe de rendimentos', description: 'Informe para IR', formFields: ['description', 'yearRef'], slaId: 'SLA001', active: true }
            ]},
            { id: 'CAT002', name: 'Frequencia', description: 'Ponto, faltas e jornada', icon: 'fa-clock', color: '#2563eb', active: true, services: [
                { id: 'SRV004', name: 'Ajuste de ponto', description: 'Ajuste de registro de ponto', formFields: ['description', 'date', 'time'], slaId: 'SLA001', active: true },
                { id: 'SRV005', name: 'Abono de falta', description: 'Abono mediante justificativa', formFields: ['description', 'date', 'justification'], slaId: 'SLA002', active: true },
                { id: 'SRV006', name: 'Banco de horas', description: 'Consulta de banco de horas', formFields: ['description'], slaId: 'SLA001', active: true }
            ]},
            { id: 'CAT003', name: 'Beneficios', description: 'VT, VR, plano de saude', icon: 'fa-gift', color: '#7c3aed', active: true, services: [
                { id: 'SRV007', name: 'Inclusao em beneficio', description: 'Solicitar inclusao', formFields: ['description', 'benefitType'], slaId: 'SLA002', active: true },
                { id: 'SRV008', name: 'Alteracao de beneficio', description: 'Alterar dados', formFields: ['description', 'benefitType'], slaId: 'SLA002', active: true }
            ]},
            { id: 'CAT004', name: 'Treinamento', description: 'Cursos e capacitacoes', icon: 'fa-graduation-cap', color: '#d97706', active: true, services: [
                { id: 'SRV010', name: 'Solicitar treinamento', description: 'Participacao em curso', formFields: ['description', 'courseName', 'justification'], slaId: 'SLA003', active: true }
            ]},
            { id: 'CAT005', name: 'Ferias', description: 'Programacao e duvidas', icon: 'fa-umbrella-beach', color: '#0891b2', active: true, services: [
                { id: 'SRV012', name: 'Programacao de ferias', description: 'Solicitar ferias', formFields: ['description', 'startDate', 'endDate'], slaId: 'SLA002', active: true }
            ]},
            { id: 'CAT006', name: 'Documentos', description: 'Declaracoes e certidoes', icon: 'fa-file-alt', color: '#dc2626', active: true, services: [
                { id: 'SRV014', name: 'Declaracao de vinculo', description: 'Declaracao empregaticia', formFields: ['description', 'purpose'], slaId: 'SLA001', active: true },
                { id: 'SRV015', name: 'Atualizacao cadastral', description: 'Atualizar dados cadastrais', formFields: ['description'], slaId: 'SLA001', active: true }
            ]}
        ]};
    }
    saveToLocal() {
        try {
            localStorage.setItem('rhdesk_users', JSON.stringify(this.data.users));
            localStorage.setItem('rhdesk_tickets', JSON.stringify(this.data.tickets));
            localStorage.setItem('rhdesk_catalog', JSON.stringify(this.data.catalog));
            localStorage.setItem('rhdesk_sla', JSON.stringify(this.data.sla));
            localStorage.setItem('rhdesk_messages', JSON.stringify(this.data.messages));
            localStorage.setItem('rhdesk_lastSync', new Date().toISOString());
        } catch (e) { console.error('Erro localStorage:', e); }
    }
    loadFromLocal() {
        try {
            var u = localStorage.getItem('rhdesk_users');
            var t = localStorage.getItem('rhdesk_tickets');
            var c = localStorage.getItem('rhdesk_catalog');
            var s = localStorage.getItem('rhdesk_sla');
            var m = localStorage.getItem('rhdesk_messages');
            if (u) this.data.users = JSON.parse(u);
            if (t) this.data.tickets = JSON.parse(t);
            if (c) this.data.catalog = JSON.parse(c);
            if (s) this.data.sla = JSON.parse(s);
            if (m) this.data.messages = JSON.parse(m);
            this.lastSync = localStorage.getItem('rhdesk_lastSync');
        } catch (e) { console.error('Erro load local:', e); }
    }
    async syncFromGitHub() {
        if (!this.useGitHub) return;
        var results = await Promise.all([
            githubAPI.getFile('db/users.json'), githubAPI.getFile('db/tickets.json'),
            githubAPI.getFile('db/catalog.json'), githubAPI.getFile('db/sla.json'),
            githubAPI.getFile('db/messages.json')
        ]);
        if (results[0]) this.data.users = JSON.parse(results[0]);
        if (results[1]) this.data.tickets = JSON.parse(results[1]);
        if (results[2]) this.data.catalog = JSON.parse(results[2]);
        if (results[3]) this.data.sla = JSON.parse(results[3]);
        if (results[4]) this.data.messages = JSON.parse(results[4]);
        this.saveToLocal();
        this.lastSync = new Date().toISOString();
    }
    async syncToGitHub(collection) {
        this.saveToLocal();
        if (!this.useGitHub) return;
        var fileMap = { users: 'db/users.json', tickets: 'db/tickets.json', catalog: 'db/catalog.json', sla: 'db/sla.json', messages: 'db/messages.json' };
        if (collection && fileMap[collection]) {
            try {
                await githubAPI.saveFile(fileMap[collection], JSON.stringify(this.data[collection], null, 2), 'Update ' + collection);
            } catch (e) {
                console.error('Sync error ' + collection + ':', e);
                this.syncQueue.push({ collection: collection, timestamp: Date.now() });
            }
        }
    }
    async processSyncQueue() {
        if (this.syncQueue.length === 0 || this.isSyncing) return;
        this.isSyncing = true;
        while (this.syncQueue.length > 0) {
            var item = this.syncQueue.shift();
            try { await this.syncToGitHub(item.collection); } catch (e) {
                if (!item.retries || item.retries < 3) { item.retries = (item.retries || 0) + 1; this.syncQueue.push(item); }
            }
        }
        this.isSyncing = false;
    }
    async createBackup() {
        if (!this.useGitHub) return;
        var ts = new Date().toISOString().replace(/[:.]/g, '-');
        try {
            await githubAPI.saveFile('backups/backup_' + ts + '.json', JSON.stringify(this.data, null, 2), 'Backup');
            showToast('Backup realizado!', 'success');
        } catch (e) { showToast('Erro no backup', 'error'); }
    }
    getUsers() { return this.data.users.filter(function(u) { return u.active !== false; }); }
    getAllUsers() { return this.data.users; }
    getUserById(id) { return this.data.users.find(function(u) { return u.id === id; }); }
    getUserByEmail(email) {
        var e = email.toLowerCase();
        return this.data.users.find(function(u) { return u.email.toLowerCase() === e && u.active !== false; });
    }
    async addUser(user) {
        var maxId = this.data.users.reduce(function(max, u) { var n = parseInt(u.id.replace('USR', '')); return n > max ? n : max; }, 0);
        user.id = 'USR' + String(maxId + 1).padStart(3, '0');
        user.createdAt = new Date().toISOString();
        user.active = true;
        this.data.users.push(user);
        await this.syncToGitHub('users');
        return user;
    }
    async updateUser(id, updates) {
        var idx = this.data.users.findIndex(function(u) { return u.id === id; });
        if (idx >= 0) { Object.assign(this.data.users[idx], updates); await this.syncToGitHub('users'); return this.data.users[idx]; }
        return null;
    }
    async deleteUser(id) {
        var idx = this.data.users.findIndex(function(u) { return u.id === id; });
        if (idx >= 0) { this.data.users[idx].active = false; await this.syncToGitHub('users'); }
    }
    getTickets(filter) {
        filter = filter || {};
        var tickets = this.data.tickets.slice();
        if (filter.userId) tickets = tickets.filter(function(t) { return t.createdBy === filter.userId; });
        if (filter.assignedTo) tickets = tickets.filter(function(t) { return t.assignedTo === filter.assignedTo; });
        if (filter.status) tickets = tickets.filter(function(t) { return t.status === filter.status; });
        if (filter.category) tickets = tickets.filter(function(t) { return t.categoryId === filter.category; });
        if (filter.search) {
            var s = filter.search.toLowerCase();
            tickets = tickets.filter(function(t) { return t.id.toLowerCase().indexOf(s) >= 0 || t.subject.toLowerCase().indexOf(s) >= 0 || (t.description && t.description.toLowerCase().indexOf(s) >= 0); });
        }
        tickets.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
        return tickets;
    }
    getTicketById(id) { return this.data.tickets.find(function(t) { return t.id === id; }); }
    async addTicket(ticket) {
        var count = this.data.tickets.length + 1;
        var year = new Date().getFullYear();
        ticket.id = 'CHM-' + year + '-' + String(count).padStart(5, '0');
        ticket.createdAt = new Date().toISOString();
        ticket.updatedAt = new Date().toISOString();
        ticket.status = 'aberto';
        ticket.history = [{ action: 'Chamado aberto', by: ticket.createdBy, at: ticket.createdAt, details: 'Chamado criado no sistema' }];
        var sla = this.getSLAById(ticket.slaId);
        if (sla) { ticket.slaDeadline = this.calculateSLADeadline(ticket.createdAt, sla); ticket.slaHours = sla.hours; ticket.slaCountWeekends = sla.countWeekends; }
        this.data.tickets.push(ticket);
        await this.syncToGitHub('tickets');
        return ticket;
    }
    async updateTicket(id, updates) {
        var idx = this.data.tickets.findIndex(function(t) { return t.id === id; });
        if (idx >= 0) { updates.updatedAt = new Date().toISOString(); Object.assign(this.data.tickets[idx], updates); await this.syncToGitHub('tickets'); return this.data.tickets[idx]; }
        return null;
    }
    async addTicketHistory(ticketId, action, userId, details) {
        var ticket = this.getTicketById(ticketId);
        if (ticket) {
            if (!ticket.history) ticket.history = [];
            ticket.history.push({ action: action, by: userId, at: new Date().toISOString(), details: details || '' });
            ticket.updatedAt = new Date().toISOString();
            await this.syncToGitHub('tickets');
        }
    }
    getMessages(ticketId) {
        return this.data.messages.filter(function(m) { return m.ticketId === ticketId; }).sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    }
    async addMessage(message) {
        message.id = 'MSG' + Date.now() + Math.random().toString(36).substr(2, 4);
        message.createdAt = new Date().toISOString();
        this.data.messages.push(message);
        await this.syncToGitHub('messages');
        return message;
    }
    getCategories() { return this.data.catalog.categories.filter(function(c) { return c.active !== false; }); }
    getAllCategories() { return this.data.catalog.categories; }
    getCategoryById(id) { return this.data.catalog.categories.find(function(c) { return c.id === id; }); }
    getServiceById(serviceId) {
        for (var i = 0; i < this.data.catalog.categories.length; i++) {
            var cat = this.data.catalog.categories[i];
            var srv = cat.services.find(function(s) { return s.id === serviceId; });
            if (srv) { var result = Object.assign({}, srv); result.category = cat; return result; }
        }
        return null;
    }
    async addCategory(category) {
        var maxId = this.data.catalog.categories.reduce(function(max, c) { var n = parseInt(c.id.replace('CAT', '')); return n > max ? n : max; }, 0);
        category.id = 'CAT' + String(maxId + 1).padStart(3, '0');
        category.active = true;
        category.services = category.services || [];
        this.data.catalog.categories.push(category);
        await this.syncToGitHub('catalog');
        return category;
    }
    async updateCategory(id, updates) {
        var idx = this.data.catalog.categories.findIndex(function(c) { return c.id === id; });
        if (idx >= 0) { Object.assign(this.data.catalog.categories[idx], updates); await this.syncToGitHub('catalog'); return this.data.catalog.categories[idx]; }
        return null;
    }
    async addService(categoryId, service) {
        var cat = this.getCategoryById(categoryId);
        if (cat) { service.id = 'SRV' + Date.now().toString().slice(-6); service.active = true; cat.services.push(service); await this.syncToGitHub('catalog'); return service; }
        return null;
    }
    async updateService(categoryId, serviceId, updates) {
        var cat = this.getCategoryById(categoryId);
        if (cat) {
            var idx = cat.services.findIndex(function(s) { return s.id === serviceId; });
            if (idx >= 0) { Object.assign(cat.services[idx], updates); await this.syncToGitHub('catalog'); return cat.services[idx]; }
        }
        return null;
    }
    getSLAs() { return this.data.sla.filter(function(s) { return s.active !== false; }); }
    getSLAById(id) { return this.data.sla.find(function(s) { return s.id === id; }); }
    async addSLA(sla) {
        var maxId = this.data.sla.reduce(function(max, s) { var n = parseInt(s.id.replace('SLA', '')); return n > max ? n : max; }, 0);
        sla.id = 'SLA' + String(maxId + 1).padStart(3, '0');
        sla.active = true;
        this.data.sla.push(sla);
        await this.syncToGitHub('sla');
        return sla;
    }
    async updateSLA(id, updates) {
        var idx = this.data.sla.findIndex(function(s) { return s.id === id; });
        if (idx >= 0) { Object.assign(this.data.sla[idx], updates); await this.syncToGitHub('sla'); return this.data.sla[idx]; }
        return null;
    }
    calculateSLADeadline(startDate, sla) {
        var deadline = new Date(startDate);
        var remaining = sla.hours;
        while (remaining > 0) {
            deadline.setHours(deadline.getHours() + 1);
            if (!sla.countWeekends) { var day = deadline.getDay(); if (day === 0 || day === 6) continue; }
            remaining--;
        }
        return deadline.toISOString();
    }
    getSLAStatus(ticket) {
        if (!ticket.slaDeadline) return { percent: 0, status: 'none', text: 'SLA nao definido' };
        if (ticket.status === 'fechado' || ticket.status === 'cancelado') return { percent: 100, status: 'completed', text: 'Chamado encerrado' };
        var now = new Date(), created = new Date(ticket.createdAt), deadline = new Date(ticket.slaDeadline);
        var total = deadline - created, elapsed = now - created;
        var percent = Math.min(100, Math.round((elapsed / total) * 100));
        if (now > deadline) { var overdue = Math.round((now - deadline) / 3600000); return { percent: percent, status: 'danger', text: 'SLA estourado ha ' + overdue + 'h' }; }
        var rem = Math.round((deadline - now) / 3600000);
        if (percent >= 75) return { percent: percent, status: 'warning', text: rem + 'h restantes (atencao!)' };
        return { percent: percent, status: 'ok', text: rem + 'h restantes' };
    }
}
var db = new Database();

// ============================================
// AUTH
// ============================================
var currentUser = null;

function handleLogin(event) {
    event.preventDefault();
    var email = document.getElementById('login-email').value.trim();
    var password = document.getElementById('login-password').value;
    var user = db.getUserByEmail(email);
    if (!user) { showToast('E-mail nao encontrado!', 'error'); return false; }
    if (user.password !== password) { showToast('Senha incorreta!', 'error'); return false; }
    currentUser = user;
    localStorage.setItem('rhdesk_currentUser', JSON.stringify(user));
    showMainApp();
    showToast('Bem-vindo(a), ' + user.name + '!', 'success');
    return false;
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('rhdesk_currentUser');
    showLoginScreen();
    showToast('Sessao encerrada', 'info');
}

function checkSession() {
    var saved = localStorage.getItem('rhdesk_currentUser');
    if (saved) {
        try {
            var user = JSON.parse(saved);
            var dbUser = db.getUserByEmail(user.email);
            if (dbUser) { currentUser = dbUser; return true; }
        } catch (e) { console.error('Sessao erro:', e); }
    }
    return false;
}

function getRoleName(role) {
    if (role === 'admin') return 'Administrador';
    if (role === 'analyst') return 'Analista de RH';
    return 'Usuario';
}

function isAdmin() { return currentUser && currentUser.role === 'admin'; }
function isAnalyst() { return currentUser && (currentUser.role === 'analyst' || currentUser.role === 'admin'); }
function isUser() { return currentUser && currentUser.role === 'user'; }

// ============================================
// UTILITIES
// ============================================
function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    var d = new Date(dateStr);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatStatus(status) {
    var map = { 'aberto': 'Aberto', 'em-andamento': 'Em Andamento', 'pendente': 'Pendente', 'resolvido': 'Resolvido', 'fechado': 'Fechado', 'cancelado': 'Cancelado' };
    return map[status] || status;
}

function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toast-container');
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + type;
    var icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-circle', info: 'fa-info-circle' };
    toast.innerHTML = '<i class="fas ' + (icons[type] || icons.info) + '"></i> ' + message;
    container.appendChild(toast);
    setTimeout(function() { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; setTimeout(function() { toast.remove(); }, 300); }, 4000);
}

function openModal(title, bodyHtml, footerHtml) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml || '';
    document.getElementById('modal-overlay').classList.add('active');
}

function closeModal(event) {
    if (event && event.target !== event.currentTarget) return;
    document.getElementById('modal-overlay').classList.remove('active');
}

// ============================================
// VIEWS
// ============================================
function showLoginScreen() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('main-app').classList.remove('active');
    document.getElementById('login-form').reset();
}

function showMainApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('main-app').classList.add('active');
    document.getElementById('user-name-display').textContent = currentUser.name;
    document.getElementById('user-role-display').textContent = getRoleName(currentUser.role);
    document.getElementById('user-avatar').textContent = currentUser.name.charAt(0).toUpperCase();
    buildSidebar();
    navigateTo('dashboard');
}

function buildSidebar() {
    var nav = document.getElementById('sidebar-nav');
    var openCount = db.getTickets({ status: 'aberto' }).length;
    var html = '<div class="nav-section">Principal</div>';
    html += '<div class="nav-item active" onclick="navigateTo(\'dashboard\')" data-page="dashboard"><i class="fas fa-chart-pie"></i><span>Painel</span></div>';
    html += '<div class="nav-item" onclick="navigateTo(\'new-ticket\')" data-page="new-ticket"><i class="fas fa-plus-circle"></i><span>Abrir Chamado</span></div>';
    html += '<div class="nav-item" onclick="navigateTo(\'my-tickets\')" data-page="my-tickets"><i class="fas fa-ticket-alt"></i><span>Meus Chamados</span></div>';
    if (isAnalyst()) {
        html += '<div class="nav-section">Atendimento</div>';
        html += '<div class="nav-item" onclick="navigateTo(\'all-tickets\')" data-page="all-tickets"><i class="fas fa-inbox"></i><span>Todos os Chamados</span>' + (openCount > 0 ? '<span class="badge">' + openCount + '</span>' : '') + '</div>';
        html += '<div class="nav-item" onclick="navigateTo(\'assigned-tickets\')" data-page="assigned-tickets"><i class="fas fa-user-check"></i><span>Meus Atendimentos</span></div>';
    }
    if (isAdmin()) {
        html += '<div class="nav-section">Administracao</div>';
        html += '<div class="nav-item" onclick="navigateTo(\'admin-users\')" data-page="admin-users"><i class="fas fa-users-cog"></i><span>Usuarios</span></div>';
        html += '<div class="nav-item" onclick="navigateTo(\'admin-catalog\')" data-page="admin-catalog"><i class="fas fa-th-large"></i><span>Catalogo de Servicos</span></div>';
        html += '<div class="nav-item" onclick="navigateTo(\'admin-sla\')" data-page="admin-sla"><i class="fas fa-stopwatch"></i><span>Configurar SLA</span></div>';
        html += '<div class="nav-item" onclick="navigateTo(\'admin-settings\')" data-page="admin-settings"><i class="fas fa-cog"></i><span>Configuracoes</span></div>';
    }
    nav.innerHTML = html;
}

function navigateTo(page, params) {
    params = params || {};
    document.querySelectorAll('#sidebar-nav .nav-item').forEach(function(item) {
        item.classList.remove('active');
        if (item.dataset.page === page) item.classList.add('active');
    });
    var content = document.getElementById('content');
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

// ============================================
// DASHBOARD
// ============================================
function renderDashboard(container) {
    var allTickets = isAnalyst() ? db.getTickets() : db.getTickets({ userId: currentUser.id });
    var open = allTickets.filter(function(t) { return t.status === 'aberto'; }).length;
    var inProgress = allTickets.filter(function(t) { return t.status === 'em-andamento'; }).length;
    var resolved = allTickets.filter(function(t) { return t.status === 'resolvido' || t.status === 'fechado'; }).length;
    var overdue = allTickets.filter(function(t) { var s = db.getSLAStatus(t); return s.status === 'danger' && t.status !== 'fechado' && t.status !== 'cancelado'; }).length;
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-chart-pie"></i> Painel de Controle</h2></div>' +
        '<div class="stats-grid">' +
        '<div class="stat-card"><div class="stat-icon blue"><i class="fas fa-folder-open"></i></div><div class="stat-info"><h4>' + open + '</h4><p>Abertos</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-spinner"></i></div><div class="stat-info"><h4>' + inProgress + '</h4><p>Em Andamento</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon green"><i class="fas fa-check-circle"></i></div><div class="stat-info"><h4>' + resolved + '</h4><p>Resolvidos</p></div></div>' +
        '<div class="stat-card"><div class="stat-icon red"><i class="fas fa-exclamation-triangle"></i></div><div class="stat-info"><h4>' + overdue + '</h4><p>SLA Estourado</p></div></div>' +
        '</div><div class="card"><div class="card-header"><h3>Chamados Recentes</h3></div><div class="card-body">' + renderTicketTable(allTickets.slice(0, 10)) + '</div></div>';
}

function renderTicketTable(tickets) {
    if (tickets.length === 0) return '<div class="empty-state"><i class="fas fa-inbox"></i><h3>Nenhum chamado encontrado</h3></div>';
    var html = '<div class="table-wrapper"><table><thead><tr><th>No</th><th>Assunto</th><th>Categoria</th><th>Status</th><th>Prioridade</th><th>SLA</th><th>Data</th><th>Acoes</th></tr></thead><tbody>';
    tickets.forEach(function(ticket) {
        var cat = db.getCategoryById(ticket.categoryId);
        var sla = db.getSLAStatus(ticket);
        var user = db.getUserById(ticket.createdBy);
        html += '<tr><td><strong style="color:var(--primary)">' + ticket.id + '</strong></td>' +
            '<td><div style="font-weight:500">' + escapeHtml(ticket.subject) + '</div><div style="font-size:12px;color:var(--gray-400)">por ' + (user ? user.name : 'N/A') + '</div></td>' +
            '<td>' + (cat ? cat.name : 'N/A') + '</td>' +
            '<td><span class="status-badge status-' + ticket.status + '">' + formatStatus(ticket.status) + '</span></td>' +
            '<td><span class="priority-badge priority-' + (ticket.priority || 'media') + '">' + (ticket.priority || 'media') + '</span></td>' +
            '<td><div class="sla-bar" style="width:80px;height:6px;"><div class="sla-bar-fill sla-' + sla.status + '" style="width:' + sla.percent + '%"></div></div><div style="font-size:11px;color:var(--gray-400)">' + sla.text + '</div></td>' +
            '<td style="font-size:13px">' + formatDate(ticket.createdAt) + '</td>' +
            '<td><button class="btn btn-sm btn-primary" onclick="navigateTo(\'ticket-detail\',{id:\'' + ticket.id + '\'})"><i class="fas fa-eye"></i> Ver</button></td></tr>';
    });
    return html + '</tbody></table></div>';
}

// ============================================
// NEW TICKET / CATALOG
// ============================================
function renderNewTicket(container) {
    var categories = db.getCategories();
    var html = '<div class="page-header"><h2><i class="fas fa-plus-circle"></i> Abrir Chamado</h2></div><p style="color:var(--gray-500);margin-bottom:24px;">Selecione a categoria:</p><div class="catalog-grid">';
    categories.forEach(function(cat) {
        var activeServices = cat.services.filter(function(s) { return s.active !== false; });
        html += '<div class="catalog-card" onclick="navigateTo(\'catalog-services\',{categoryId:\'' + cat.id + '\'})">' +
            '<div class="catalog-card-icon" style="background:' + cat.color + '15;color:' + cat.color + '"><i class="fas ' + cat.icon + '"></i></div>' +
            '<h3>' + escapeHtml(cat.name) + '</h3><p>' + escapeHtml(cat.description) + '</p>' +
            '<div class="service-count">' + activeServices.length + ' servico(s)</div></div>';
    });
    container.innerHTML = html + '</div>';
}

function renderCatalogServices(container, categoryId) {
    var cat = db.getCategoryById(categoryId);
    if (!cat) { navigateTo('new-ticket'); return; }
    var services = cat.services.filter(function(s) { return s.active !== false; });
    var html = '<div class="back-link" onclick="navigateTo(\'new-ticket\')"><i class="fas fa-arrow-left"></i> Voltar</div>' +
        '<div class="page-header"><h2><i class="fas ' + cat.icon + '" style="color:' + cat.color + '"></i> ' + escapeHtml(cat.name) + '</h2></div><div class="service-list">';
    services.forEach(function(srv) {
        var sla = db.getSLAById(srv.slaId);
        html += '<div class="service-item" onclick="navigateTo(\'ticket-form\',{serviceId:\'' + srv.id + '\'})">' +
            '<div><div class="service-name">' + escapeHtml(srv.name) + '</div>' +
            '<div class="service-sla">' + escapeHtml(srv.description || '') + (sla ? ' | SLA: ' + sla.hours + 'h' : '') + '</div></div>' +
            '<i class="fas fa-chevron-right"></i></div>';
    });
    container.innerHTML = html + '</div>';
}

function renderTicketForm(container, serviceId) {
    var srvInfo = db.getServiceById(serviceId);
    if (!srvInfo) { navigateTo('new-ticket'); return; }
    var cat = srvInfo.category;
    var sla = db.getSLAById(srvInfo.slaId);
    var fieldDefs = {
        description: { label: 'Descricao detalhada', type: 'textarea', required: true },
        monthRef: { label: 'Mes de referencia', type: 'month', required: true },
        yearRef: { label: 'Ano de referencia', type: 'number', required: true },
        amount: { label: 'Valor (R$)', type: 'number', required: false },
        date: { label: 'Data', type: 'date', required: true },
        time: { label: 'Horario', type: 'time', required: false },
        startDate: { label: 'Data inicio', type: 'date', required: true },
        endDate: { label: 'Data fim', type: 'date', required: true },
        justification: { label: 'Justificativa', type: 'textarea', required: true },
        benefitType: { label: 'Tipo de beneficio', type: 'select', options: ['Vale-Transporte','Vale-Refeicao','Plano de Saude','Outro'], required: true },
        courseName: { label: 'Nome do curso', type: 'text', required: true },
        purpose: { label: 'Finalidade', type: 'text', required: false }
    };
    var fields = srvInfo.formFields || ['description'];
    var fieldsHtml = '';
    fields.forEach(function(key) {
        var def = fieldDefs[key] || { label: key, type: 'text', required: false };
        fieldsHtml += '<div class="form-group"><label>' + def.label + (def.required ? ' *' : '') + '</label>';
        if (def.type === 'textarea') fieldsHtml += '<textarea id="field-' + key + '"' + (def.required ? ' required' : '') + '></textarea>';
        else if (def.type === 'select') {
            fieldsHtml += '<select id="field-' + key + '"' + (def.required ? ' required' : '') + '><option value="">Selecione...</option>';
            (def.options || []).forEach(function(o) { fieldsHtml += '<option value="' + o + '">' + o + '</option>'; });
            fieldsHtml += '</select>';
        } else fieldsHtml += '<input type="' + def.type + '" id="field-' + key + '"' + (def.required ? ' required' : '') + '>';
        fieldsHtml += '</div>';
    });
    container.innerHTML = '<div class="back-link" onclick="navigateTo(\'catalog-services\',{categoryId:\'' + cat.id + '\'})"><i class="fas fa-arrow-left"></i> Voltar</div>' +
        '<div class="page-header"><h2><i class="fas fa-edit"></i> ' + escapeHtml(srvInfo.name) + '</h2></div>' +
        '<div class="card"><div class="card-header"><h3>Formulario</h3></div><div class="card-body">' +
        '<form id="ticket-form" onsubmit="return submitTicket(event, \'' + serviceId + '\')">' +
        '<div class="form-group"><label>Assunto *</label><input type="text" id="ticket-subject" required value="' + escapeHtml(srvInfo.name) + '"></div>' +
        '<div class="form-group"><label>Prioridade</label><select id="ticket-priority"><option value="baixa">Baixa</option><option value="media" selected>Media</option><option value="alta">Alta</option><option value="critica">Critica</option></select></div>' +
        fieldsHtml +
        '<div class="form-group"><label>Anexos</label><div class="file-upload-area" onclick="document.getElementById(\'ticket-files\').click()"><i class="fas fa-cloud-upload-alt"></i><p>Clique para anexar</p></div><input type="file" id="ticket-files" multiple style="display:none" onchange="handleFileSelect(this)"><div id="file-list" class="file-list"></div></div>' +
        '<button type="submit" class="btn btn-primary btn-full" id="btn-submit-ticket"><i class="fas fa-paper-plane"></i> Enviar Chamado</button>' +
        '</form></div></div>';
}

// ============================================
// MY TICKETS
// ============================================
function renderMyTickets(container) {
    var tickets = db.getTickets({ userId: currentUser.id });
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-ticket-alt"></i> Meus Chamados</h2>' +
        '<button class="btn btn-primary" onclick="navigateTo(\'new-ticket\')"><i class="fas fa-plus"></i> Novo</button></div>' +
        '<div class="card"><div class="card-body" id="my-tickets-table">' + renderTicketTable(tickets) + '</div></div>';
}

function renderAllTickets(container) {
    var tickets = db.getTickets();
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-inbox"></i> Todos os Chamados</h2></div>' +
        '<div class="filters-bar"><div class="search-input"><i class="fas fa-search"></i><input type="text" placeholder="Buscar..." onkeyup="filterAllTickets()"></div>' +
        '<select id="filter-status" onchange="filterAllTickets()"><option value="">Todos</option><option value="aberto">Aberto</option><option value="em-andamento">Em Andamento</option><option value="pendente">Pendente</option><option value="resolvido">Resolvido</option><option value="fechado">Fechado</option></select></div>' +
        '<div class="card"><div class="card-body" id="all-tickets-table">' + renderTicketTable(tickets) + '</div></div>';
}

function filterAllTickets() {
    var search = document.querySelector('.filters-bar .search-input input');
    var status = document.getElementById('filter-status');
    var filter = {};
    if (search && search.value) filter.search = search.value;
    if (status && status.value) filter.status = status.value;
    document.getElementById('all-tickets-table').innerHTML = renderTicketTable(db.getTickets(filter));
}

function renderAssignedTickets(container) {
    var tickets = db.getTickets({ assignedTo: currentUser.id });
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-user-check"></i> Meus Atendimentos</h2></div>' +
        '<div class="card"><div class="card-body">' + renderTicketTable(tickets) + '</div></div>';
}

// ============================================
// TICKETS
// ============================================
var selectedFiles = [];

function handleFileSelect(input) {
    selectedFiles = selectedFiles.concat(Array.from(input.files));
    renderFileList();
}

function removeFile(index) { selectedFiles.splice(index, 1); renderFileList(); }

function renderFileList() {
    var container = document.getElementById('file-list');
    if (!container) return;
    if (selectedFiles.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = selectedFiles.map(function(file, i) {
        return '<div class="file-item"><i class="fas fa-file" style="color:var(--primary)"></i><span>' + escapeHtml(file.name) + '</span><span class="remove-file" onclick="removeFile(' + i + ')"><i class="fas fa-times"></i></span></div>';
    }).join('');
}

async function submitTicket(event, serviceId) {
    event.preventDefault();
    var srvInfo = db.getServiceById(serviceId);
    if (!srvInfo) { showToast('Servico nao encontrado', 'error'); return false; }
    var btn = document.getElementById('btn-submit-ticket');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    try {
        var formData = {};
        (srvInfo.formFields || ['description']).forEach(function(field) {
            var el = document.getElementById('field-' + field);
            if (el) formData[field] = el.value;
        });
        var ticket = {
            subject: document.getElementById('ticket-subject').value,
            description: formData.description || '',
            priority: document.getElementById('ticket-priority').value,
            categoryId: srvInfo.category.id, serviceId: serviceId, serviceName: srvInfo.name,
            createdBy: currentUser.id, assignedTo: null, formData: formData, slaId: srvInfo.slaId, attachments: []
        };
        var newTicket = await db.addTicket(ticket);
        await db.addMessage({ ticketId: newTicket.id, userId: currentUser.id, type: 'system', text: 'Chamado ' + newTicket.id + ' aberto' });
        if (formData.description) await db.addMessage({ ticketId: newTicket.id, userId: currentUser.id, type: 'message', text: formData.description });
        selectedFiles = [];
        showToast('Chamado ' + newTicket.id + ' criado!', 'success');
        buildSidebar();
        navigateTo('ticket-detail', { id: newTicket.id });
    } catch (e) { console.error(e); showToast('Erro ao criar chamado', 'error'); }
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Chamado';
    return false;
}

function renderTicketDetail(container, ticketId) {
    var ticket = db.getTicketById(ticketId);
    if (!ticket) { showToast('Chamado nao encontrado', 'error'); navigateTo('my-tickets'); return; }
    var cat = db.getCategoryById(ticket.categoryId);
    var slaStatus = db.getSLAStatus(ticket);
    var createdBy = db.getUserById(ticket.createdBy);
    var assignedUser = ticket.assignedTo ? db.getUserById(ticket.assignedTo) : null;
        var messages = db.getMessages(ticketId);
    var analysts = db.getUsers().filter(function(u)


};
    var analysts = db.getUsers().filter(function(u) { return u.role === 'analyst' || u.role === 'admin'; });
    var canManage = isAnalyst();
    var isClosed = ticket.status === 'fechado' || ticket.status === 'cancelado';

    var actionBtns = '';
    if (canManage && !isClosed) actionBtns = '<button class="btn btn-success btn-sm" onclick="changeTicketStatus(\'' + ticket.id + '\',\'resolvido\')"><i class="fas fa-check"></i> Resolver</button><button class="btn btn-secondary btn-sm" onclick="changeTicketStatus(\'' + ticket.id + '\',\'fechado\')"><i class="fas fa-lock"></i> Fechar</button>';
    if (!canManage && ticket.status === 'resolvido') actionBtns = '<button class="btn btn-success btn-sm" onclick="changeTicketStatus(\'' + ticket.id + '\',\'fechado\')"><i class="fas fa-thumbs-up"></i> Confirmar</button><button class="btn btn-warning btn-sm" onclick="changeTicketStatus(\'' + ticket.id + '\',\'aberto\')"><i class="fas fa-redo"></i> Reabrir</button>';

    var chatHtml = renderChatMessages(messages);
    var chatInput = !isClosed ? '<div class="chat-input-area"><textarea id="chat-input" placeholder="Digite sua mensagem..." onkeydown="handleChatKeyDown(event, \'' + ticket.id + '\')"></textarea><div class="chat-input-actions"><label class="btn btn-icon" style="cursor:pointer"><i class="fas fa-paperclip"></i><input type="file" style="display:none" onchange="sendFileMessage(\'' + ticket.id + '\', this)"></label><button class="btn btn-primary btn-sm" onclick="sendMessage(\'' + ticket.id + '\')"><i class="fas fa-paper-plane"></i></button></div></div>' : '<div style="padding:16px;text-align:center;color:var(--gray-400)"><i class="fas fa-lock"></i> Chamado encerrado</div>';

    var historyHtml = (ticket.history || []).slice().reverse().map(function(h) {
        var u = db.getUserById(h.by);
        return '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--gray-100)"><div style="width:32px;height:32px;border-radius:50%;background:var(--gray-200);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas fa-clock" style="font-size:12px;color:var(--gray-500)"></i></div><div><div style="font-size:14px;font-weight:500">' + escapeHtml(h.action) + '</div><div style="font-size:12px;color:var(--gray-400)">por ' + (u ? u.name : 'Sistema') + ' em ' + formatDate(h.at) + '</div></div></div>';
    }).join('');

    var manageHtml = '';
    if (canManage && !isClosed) {
        var analystOptions = analysts.map(function(a) { return '<option value="' + a.id + '"' + (ticket.assignedTo === a.id ? ' selected' : '') + '>' + a.name + '</option>'; }).join('');
        manageHtml = '<div style="margin-top:16px"><div class="form-group"><label>Atribuir a:</label><select onchange="assignTicket(\'' + ticket.id + '\', this.value)"><option value="">Selecione...</option>' + analystOptions + '</select></div>' +
            '<div class="form-group"><label>Status:</label><select onchange="changeTicketStatus(\'' + ticket.id + '\', this.value)"><option value="aberto"' + (ticket.status === 'aberto' ? ' selected' : '') + '>Aberto</option><option value="em-andamento"' + (ticket.status === 'em-andamento' ? ' selected' : '') + '>Em Andamento</option><option value="pendente"' + (ticket.status === 'pendente' ? ' selected' : '') + '>Pendente</option><option value="resolvido"' + (ticket.status === 'resolvido' ? ' selected' : '') + '>Resolvido</option><option value="fechado"' + (ticket.status === 'fechado' ? ' selected' : '') + '>Fechado</option><option value="cancelado"' + (ticket.status === 'cancelado' ? ' selected' : '') + '>Cancelado</option></select></div>' +
            '<div class="form-group"><label>Prioridade:</label><select onchange="changeTicketPriority(\'' + ticket.id + '\', this.value)"><option value="baixa"' + (ticket.priority === 'baixa' ? ' selected' : '') + '>Baixa</option><option value="media"' + (ticket.priority === 'media' ? ' selected' : '') + '>Media</option><option value="alta"' + (ticket.priority === 'alta' ? ' selected' : '') + '>Alta</option><option value="critica"' + (ticket.priority === 'critica' ? ' selected' : '') + '>Critica</option></select></div></div>';
    }

    container.innerHTML = '<div class="back-link" onclick="navigateTo(\'' + (isAnalyst() ? 'all-tickets' : 'my-tickets') + '\')"><i class="fas fa-arrow-left"></i> Voltar</div>' +
        '<div class="page-header"><h2><i class="fas fa-ticket-alt"></i> ' + ticket.id + '</h2><div style="display:flex;gap:8px">' + actionBtns + '</div></div>' +
        '<div class="ticket-detail-grid"><div>' +
        '<div class="card" style="margin-bottom:20px"><div class="card-header"><h3>' + escapeHtml(ticket.subject) + '</h3><span class="status-badge status-' + ticket.status + '">' + formatStatus(ticket.status) + '</span></div></div>' +
        '<div class="card"><div class="card-header"><h3><i class="fas fa-comments" style="color:var(--primary);margin-right:8px"></i> Conversas</h3></div><div class="chat-container"><div class="chat-messages" id="chat-messages">' + chatHtml + '</div>' + chatInput + '</div></div>' +
        '<div class="card" style="margin-top:20px"><div class="card-header"><h3>Historico</h3></div><div class="card-body">' + historyHtml + '</div></div></div>' +
        '<div><div class="card ticket-info-panel" style="margin-bottom:16px"><div class="card-header"><h3>Detalhes</h3></div><div class="card-body">' +
        '<div class="info-row"><span class="label">Status</span><span class="status-badge status-' + ticket.status + '">' + formatStatus(ticket.status) + '</span></div>' +
        '<div class="info-row"><span class="label">Prioridade</span><span class="priority-badge priority-' + ticket.priority + '">' + ticket.priority + '</span></div>' +
        '<div class="info-row"><span class="label">Categoria</span><span class="value">' + (cat ? cat.name : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="label">Servico</span><span class="value">' + (ticket.serviceName || 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="label">Solicitante</span><span class="value">' + (createdBy ? createdBy.name : 'N/A') + '</span></div>' +
        '<div class="info-row"><span class="label">Atribuido a</span><span class="value">' + (assignedUser ? assignedUser.name : '<em style="color:var(--gray-400)">Nao atribuido</em>') + '</span></div>' +
        '<div class="info-row"><span class="label">Criado em</span><span class="value">' + formatDate(ticket.createdAt) + '</span></div>' +
        manageHtml + '</div></div>' +
        '<div class="card"><div class="card-header"><h3>SLA</h3></div><div class="card-body"><div class="sla-bar"><div class="sla-bar-fill sla-' + slaStatus.status + '" style="width:' + Math.min(100, slaStatus.percent) + '%"></div></div><div class="sla-text">' + slaStatus.text + '</div>' +
        '<div style="margin-top:12px;font-size:13px"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--gray-400)">Prazo:</span><span>' + (ticket.slaHours || 'N/A') + 'h</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:var(--gray-400)">Fins de semana:</span><span>' + (ticket.slaCountWeekends ? 'Sim' : 'Nao') + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="color:var(--gray-400)">Vencimento:</span><span>' + (ticket.slaDeadline ? formatDate(ticket.slaDeadline) : 'N/A') + '</span></div></div>' +
        '</div></div></div></div>';

    var chatEl = document.getElementById('chat-messages');
    if (chatEl) chatEl.scrollTop = chatEl.scrollHeight;
}

function renderChatMessages(messages) {
    if (messages.length === 0) return '<div class="empty-state" style="padding:30px"><i class="fas fa-comments" style="font-size:32px"></i><p>Nenhuma mensagem</p></div>';
    return messages.map(function(msg) {
        var u = db.getUserById(msg.userId);
        var isOwn = msg.userId === currentUser.id;
        if (msg.type === 'system') return '<div class="chat-message system"><div class="chat-message-bubble"><div class="msg-text"><i class="fas fa-info-circle"></i> ' + escapeHtml(msg.text) + '</div><div class="msg-time">' + formatDate(msg.createdAt) + '</div></div></div>';
        var color = isOwn ? 'var(--primary)' : 'var(--secondary)';
        var initial = u ? u.name.charAt(0).toUpperCase() : '?';
        var attachHtml = '';
        if (msg.attachment) {
            var url = db.useGitHub ? githubAPI.getDownloadUrl(msg.attachment.path) : (msg.attachment.data || '#');
            attachHtml = '<a class="msg-attachment" href="' + url + '" target="_blank"><i class="fas fa-download"></i> ' + escapeHtml(msg.attachment.name) + '</a>';
        }
        return '<div class="chat-message ' + (isOwn ? 'own' : '') + '"><div class="chat-message-avatar" style="background:' + color + '">' + initial + '</div><div class="chat-message-bubble"><div class="msg-author">' + (u ? u.name : '?') + (u && (u.role === 'analyst' || u.role === 'admin') ? ' <span style="font-size:10px;opacity:0.7">RH</span>' : '') + '</div><div class="msg-text">' + escapeHtml(msg.text) + '</div>' + attachHtml + '<div class="msg-time">' + formatDate(msg.createdAt) + '</div></div></div>';
    }).join('');
}

async function sendMessage(ticketId) {
    var input = document.getElementById('chat-input');
    var text = input.value.trim();
    if (!text) return;
    input.value = '';
    await db.addMessage({ ticketId: ticketId, userId: currentUser.id, type: 'message', text: text });
    var ticket = db.getTicketById(ticketId);
    if (isAnalyst() && ticket.status === 'aberto') {
        await db.updateTicket(ticketId, { status: 'em-andamento' });
        await db.addTicketHistory(ticketId, 'Status: Em Andamento', currentUser.id, 'Automatico ao responder');
    }
    renderTicketDetail(document.getElementById('content'), ticketId);
}

function handleChatKeyDown(event, ticketId) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(ticketId); }
}

async function sendFileMessage(ticketId, input) {
    var file = input.files[0];
    if (!file) return;
    var path = 'attachments/' + Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var attachment = { name: file.name, path: path, size: file.size, type: file.type };
    if (db.useGitHub) { try { await githubAPI.uploadFile(path, file); } catch (e) { console.error(e); } }
    else {
        var reader = new FileReader();
        var base64 = await new Promise(function(resolve) { reader.onload = function() { resolve(reader.result); }; reader.readAsDataURL(file); });
        attachment.data = base64;
    }
    await db.addMessage({ ticketId: ticketId, userId: currentUser.id, type: 'message', text: 'Arquivo: ' + file.name, attachment: attachment });
    showToast('Arquivo enviado!', 'success');
    renderTicketDetail(document.getElementById('content'), ticketId);
}

async function assignTicket(ticketId, analystId) {
    if (!analystId) return;
    var analyst = db.getUserById(analystId);
    await db.updateTicket(ticketId, { assignedTo: analystId });
    await db.addTicketHistory(ticketId, 'Atribuido a ' + (analyst ? analyst.name : analystId), currentUser.id);
    if (db.getTicketById(ticketId).status === 'aberto') { await db.updateTicket(ticketId, { status: 'em-andamento' }); }
    await db.addMessage({ ticketId: ticketId, userId: currentUser.id, type: 'system', text: 'Atribuido a ' + (analyst ? analyst.name : 'analista') });
    showToast('Chamado atribuido!', 'success');
    renderTicketDetail(document.getElementById('content'), ticketId);
}

async function changeTicketStatus(ticketId, newStatus) {
    var old = db.getTicketById(ticketId);
    await db.updateTicket(ticketId, { status: newStatus });
    await db.addTicketHistory(ticketId, 'Status: ' + formatStatus(old.status) + ' -> ' + formatStatus(newStatus), currentUser.id);
    await db.addMessage({ ticketId: ticketId, userId: currentUser.id, type: 'system', text: 'Status: ' + formatStatus(newStatus) });
    buildSidebar();
    showToast('Status alterado!', 'success');
    renderTicketDetail(document.getElementById('content'), ticketId);
}

async function changeTicketPriority(ticketId, newPriority) {
    await db.updateTicket(ticketId, { priority: newPriority });
    await db.addTicketHistory(ticketId, 'Prioridade: ' + newPriority, currentUser.id);
    showToast('Prioridade alterada!', 'success');
    renderTicketDetail(document.getElementById('content'), ticketId);
}

// ============================================
// ADMIN - USERS
// ============================================
function renderAdminUsers(container) {
    if (!isAdmin()) { showToast('Acesso negado', 'error'); return; }
    var users = db.getAllUsers();
    var rows = users.map(function(u) {
        var roleColor = u.role === 'admin' ? 'var(--danger)' : u.role === 'analyst' ? 'var(--secondary)' : 'var(--primary)';
        return '<tr style="' + (u.active === false ? 'opacity:0.5' : '') + '"><td><strong>' + u.id + '</strong></td><td>' + escapeHtml(u.name) + '</td><td>' + escapeHtml(u.email) + '</td>' +
            '<td><span class="role-badge" style="background:' + roleColor + '">' + getRoleName(u.role) + '</span></td>' +
            '<td><span class="status-badge ' + (u.active !== false ? 'status-aberto' : 'status-fechado') + '">' + (u.active !== false ? 'Ativo' : 'Inativo') + '</span></td>' +
            '<td style="font-size:13px">' + formatDate(u.createdAt) + '</td>' +
            '<td class="actions"><button class="btn btn-sm btn-outline" onclick="showUserModal(\'' + u.id + '\')"><i class="fas fa-edit"></i></button>' +
            (u.id !== currentUser.id ? '<button class="btn btn-sm ' + (u.active !== false ? 'btn-danger' : 'btn-success') + '" onclick="toggleUserActive(\'' + u.id + '\')"><i class="fas fa-' + (u.active !== false ? 'ban' : 'check') + '"></i></button>' : '') + '</td></tr>';
    }).join('');
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-users-cog"></i> Usuarios</h2><button class="btn btn-primary" onclick="showUserModal()"><i class="fas fa-user-plus"></i> Novo Usuario</button></div>' +
        '<div class="card"><div class="card-body"><div class="table-wrapper"><table><thead><tr><th>ID</th><th>Nome</th><th>E-mail</th><th>Perfil</th><th>Status</th><th>Criado</th><th>Acoes</th></tr></thead><tbody>' + rows + '</tbody></table></div></div></div>';
}

function showUserModal(userId) {
    var user = userId ? db.getUserById(userId) : null;
    var isEdit = !!user;
    var body = '<form id="user-form">' +
        '<div class="form-group"><label>Nome *</label><input type="text" id="user-name" required value="' + (isEdit ? escapeHtml(user.name) : '') + '"></div>' +
        '<div class="form-group"><label>E-mail *</label><input type="email" id="user-email" required value="' + (isEdit ? escapeHtml(user.email) : '') + '"></div>' +
        '<div class="form-group"><label>Senha ' + (isEdit ? '(vazio = manter)' : '*') + '</label><input type="password" id="user-password" ' + (isEdit ? '' : 'required') + '></div>' +
        '<div class="form-group"><label>Perfil *</label><select id="user-role" required>' +
        '<option value="user"' + (isEdit && user.role === 'user' ? ' selected' : '') + '>Usuario</option>' +
        '<option value="analyst"' + (isEdit && user.role === 'analyst' ? ' selected' : '') + '>Analista de RH</option>' +
        '<option value="admin"' + (isEdit && user.role === 'admin' ? ' selected' : '') + '>Administrador</option></select></div></form>';
    var footer = '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveUser(\'' + (userId || '') + '\')">' + (isEdit ? 'Salvar' : 'Criar') + '</button>';
    openModal(isEdit ? 'Editar Usuario' : 'Novo Usuario', body, footer);
}

async function saveUser(userId) {
    var name = document.getElementById('user-name').value.trim();
    var email = document.getElementById('user-email').value.trim();
    var password = document.getElementById('user-password').value;
    var role = document.getElementById('user-role').value;
    if (!name || !email || !role) { showToast('Preencha os campos', 'error'); return; }
    if (userId) {
        var updates = { name: name, email: email, role: role };
        if (password) updates.password = password;
        await db.updateUser(userId, updates);
        showToast('Usuario atualizado!', 'success');
    } else {
        if (!password) { showToast('Informe a senha', 'error'); return; }
        if (db.getUserByEmail(email)) { showToast('E-mail ja existe!', 'error'); return; }
        await db.addUser({ name: name, email: email, password: password, role: role });
        showToast('Usuario criado!', 'success');
    }
    closeModal();
    renderAdminUsers(document.getElementById('content'));
}

async function toggleUserActive(userId) {
    var user = db.getUserById(userId);
    if (user) {
        await db.updateUser(userId, { active: user.active === false ? true : false });
        showToast('Status alterado!', 'success');
        renderAdminUsers(document.getElementById('content'));
    }
}

// ============================================
// ADMIN - CATALOG
// ============================================
function renderAdminCatalog(container) {
    if (!isAdmin()) return;
    var cats = db.getAllCategories();
    var rows = cats.map(function(c) {
        return '<tr><td><i class="fas ' + c.icon + '" style="font-size:24px;color:' + c.color + '"></i></td><td><strong>' + escapeHtml(c.name) + '</strong></td>' +
            '<td style="font-size:13px;color:var(--gray-500)">' + escapeHtml(c.description) + '</td><td><strong style="color:var(--primary)">' + c.services.length + '</strong></td>' +
            '<td><span class="status-badge ' + (c.active !== false ? 'status-aberto' : 'status-fechado') + '">' + (c.active !== false ? 'Ativo' : 'Inativo') + '</span></td>' +
            '<td class="actions"><button class="btn btn-sm btn-primary" onclick="navigateTo(\'admin-catalog-edit\',{categoryId:\'' + c.id + '\'})"><i class="fas fa-cog"></i> Gerenciar</button>' +
            '<button class="btn btn-sm btn-outline" onclick="showCategoryModal(\'' + c.id + '\')"><i class="fas fa-edit"></i></button></td></tr>';
    }).join('');
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-th-large"></i> Catalogo de Servicos</h2><button class="btn btn-primary" onclick="showCategoryModal()"><i class="fas fa-plus"></i> Nova Categoria</button></div>' +
        '<div class="card"><div class="card-body"><table><thead><tr><th></th><th>Categoria</th><th>Descricao</th><th>Servicos</th><th>Status</th><th>Acoes</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

function showCategoryModal(categoryId) {
    var cat = categoryId ? db.getCategoryById(categoryId) : null;
    var isEdit = !!cat;
    var icons = ['fa-money-bill-wave','fa-clock','fa-gift','fa-graduation-cap','fa-umbrella-beach','fa-file-alt','fa-briefcase','fa-heart','fa-building','fa-users','fa-star','fa-cog','fa-shield-alt','fa-handshake','fa-id-card'];
    var colors = ['#059669','#2563eb','#7c3aed','#d97706','#0891b2','#dc2626','#4b5563','#db2777'];
    var iconHtml = icons.map(function(ic) {
        var sel = isEdit && cat.icon === ic;
        return '<div onclick="selectIcon(this,\'' + ic + '\')" class="icon-option" style="width:40px;height:40px;border:2px solid ' + (sel ? 'var(--primary)' : 'var(--gray-200)') + ';border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;' + (sel ? 'background:var(--primary-light)' : '') + '"><i class="fas ' + ic + '" style="font-size:18px"></i></div>';
    }).join('');
    var colorHtml = colors.map(function(cl) {
        var sel = isEdit && cat.color === cl;
        return '<div onclick="selectColor(this,\'' + cl + '\')" class="color-option" style="width:36px;height:36px;border-radius:50%;background:' + cl + ';cursor:pointer;border:3px solid ' + (sel ? 'var(--gray-900)' : 'transparent') + '"></div>';
    }).join('');
    var body = '<form><div class="form-group"><label>Nome *</label><input type="text" id="cat-name" required value="' + (isEdit ? escapeHtml(cat.name) : '') + '"></div>' +
        '<div class="form-group"><label>Descricao</label><textarea id="cat-desc">' + (isEdit ? escapeHtml(cat.description) : '') + '</textarea></div>' +
        '<div class="form-group"><label>Icone</label><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">' + iconHtml + '</div><input type="hidden" id="cat-icon" value="' + (isEdit ? cat.icon : icons[0]) + '"></div>' +
        '<div class="form-group"><label>Cor</label><div style="display:flex;gap:8px;margin-top:8px">' + colorHtml + '</div><input type="hidden" id="cat-color" value="' + (isEdit ? cat.color : colors[0]) + '"></div></form>';
    var footer = '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveCategory(\'' + (categoryId || '') + '\')">' + (isEdit ? 'Salvar' : 'Criar') + '</button>';
    openModal(isEdit ? 'Editar Categoria' : 'Nova Categoria', body, footer);
}

function selectIcon(el, icon) {
    document.querySelectorAll('.icon-option').forEach(function(e) { e.style.borderColor = 'var(--gray-200)'; e.style.background = 'transparent'; });
    el.style.borderColor = 'var(--primary)'; el.style.background = 'var(--primary-light)';
    document.getElementById('cat-icon').value = icon;
}

function selectColor(el, color) {
    document.querySelectorAll('.color-option').forEach(function(e) { e.style.borderColor = 'transparent'; });
    el.style.borderColor = 'var(--gray-900)';
    document.getElementById('cat-color').value = color;
}

async function saveCategory(categoryId) {
    var name = document.getElementById('cat-name').value.trim();
    var desc = document.getElementById('cat-desc').value.trim();
    var icon = document.getElementById('cat-icon').value;
    var color = document.getElementById('cat-color').value;
    if (!name) { showToast('Informe o nome', 'error'); return; }
    if (categoryId) { await db.updateCategory(categoryId, { name: name, description: desc, icon: icon, color: color }); showToast('Atualizado!', 'success'); }
    else { await db.addCategory({ name: name, description: desc, icon: icon, color: color, services: [] }); showToast('Criado!', 'success'); }
    closeModal();
    renderAdminCatalog(document.getElementById('content'));
}

function renderAdminCatalogEdit(container, categoryId) {
    var cat = db.getCategoryById(categoryId);
    if (!cat) { navigateTo('admin-catalog'); return; }
    var rows = cat.services.map(function(srv) {
        var sla = db.getSLAById(srv.slaId);
        return '<tr><td><strong>' + escapeHtml(srv.name) + '</strong></td><td style="font-size:13px;color:var(--gray-500)">' + escapeHtml(srv.description || '') + '</td>' +
            '<td>' + (sla ? sla.name + ' (' + sla.hours + 'h)' : 'N/A') + '</td>' +
            '<td style="font-size:12px">' + (srv.formFields || []).join(', ') + '</td>' +
            '<td><span class="status-badge ' + (srv.active !== false ? 'status-aberto' : 'status-fechado') + '">' + (srv.active !== false ? 'Ativo' : 'Inativo') + '</span></td>' +
            '<td class="actions"><button class="btn btn-sm btn-outline" onclick="showServiceModal(\'' + categoryId + '\',\'' + srv.id + '\')"><i class="fas fa-edit"></i></button>' +
            '<button class="btn btn-sm ' + (srv.active !== false ? 'btn-danger' : 'btn-success') + '" onclick="toggleService(\'' + categoryId + '\',\'' + srv.id + '\')"><i class="fas fa-' + (srv.active !== false ? 'ban' : 'check') + '"></i></button></td></tr>';
    }).join('');
    container.innerHTML = '<div class="back-link" onclick="navigateTo(\'admin-catalog\')"><i class="fas fa-arrow-left"></i> Voltar</div>' +
        '<div class="page-header"><h2><i class="fas ' + cat.icon + '" style="color:' + cat.color + '"></i> ' + escapeHtml(cat.name) + '</h2><button class="btn btn-primary" onclick="showServiceModal(\'' + categoryId + '\')"><i class="fas fa-plus"></i> Novo Servico</button></div>' +
        '<div class="card"><div class="card-body">' + (cat.services.length === 0 ? '<div class="empty-state"><i class="fas fa-clipboard-list"></i><h3>Nenhum servico</h3></div>' :
        '<table><thead><tr><th>Servico</th><th>Descricao</th><th>SLA</th><th>Campos</th><th>Status</th><th>Acoes</th></tr></thead><tbody>' + rows + '</tbody></table>') + '</div></div>';
}

function showServiceModal(categoryId, serviceId) {
    var cat = db.getCategoryById(categoryId);
    var srv = serviceId ? cat.services.find(function(s) { return s.id === serviceId; }) : null;
    var isEdit = !!srv;
    var slas = db.getSLAs();
    var slaOpts = slas.map(function(s) { return '<option value="' + s.id + '"' + (isEdit && srv.slaId === s.id ? ' selected' : '') + '>' + s.name + ' (' + s.hours + 'h)</option>'; }).join('');
    var allFields = [
        { key: 'description', label: 'Descricao' }, { key: 'monthRef', label: 'Mes ref' }, { key: 'yearRef', label: 'Ano ref' },
        { key: 'amount', label: 'Valor' }, { key: 'date', label: 'Data' }, { key: 'time', label: 'Horario' },
        { key: 'startDate', label: 'Data inicio' }, { key: 'endDate', label: 'Data fim' }, { key: 'justification', label: 'Justificativa' },
        { key: 'benefitType', label: 'Tipo beneficio' }, { key: 'courseName', label: 'Nome curso' }, { key: 'purpose', label: 'Finalidade' }
    ];
    var selected = isEdit ? (srv.formFields || []) : ['description'];
    var fieldsHtml = allFields.map(function(f) {
        return '<label class="checkbox-group"><input type="checkbox" value="' + f.key + '" class="srv-field-check"' + (selected.indexOf(f.key) >= 0 ? ' checked' : '') + '> ' + f.label + '</label>';
    }).join('');
    var body = '<form><div class="form-group"><label>Nome *</label><input type="text" id="srv-name" required value="' + (isEdit ? escapeHtml(srv.name) : '') + '"></div>' +
        '<div class="form-group"><label>Descricao</label><textarea id="srv-desc">' + (isEdit ? escapeHtml(srv.description || '') : '') + '</textarea></div>' +
        '<div class="form-group"><label>SLA *</label><select id="srv-sla" required><option value="">Selecione...</option>' + slaOpts + '</select></div>' +
        '<div class="form-group"><label>Campos do Formulario</label><div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">' + fieldsHtml + '</div></div></form>';
    var footer = '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveService(\'' + categoryId + '\',\'' + (serviceId || '') + '\')">' + (isEdit ? 'Salvar' : 'Criar') + '</button>';
    openModal(isEdit ? 'Editar Servico' : 'Novo Servico', body, footer);
}

async function saveService(categoryId, serviceId) {
    var name = document.getElementById('srv-name').value.trim();
    var desc = document.getElementById('srv-desc').value.trim();
    var slaId = document.getElementById('srv-sla').value;
    var fields = Array.from(document.querySelectorAll('.srv-field-check:checked')).map(function(cb) { return cb.value; });
    if (!name || !slaId) { showToast('Preencha os campos', 'error'); return; }
    if (serviceId) { await db.updateService(categoryId, serviceId, { name: name, description: desc, slaId: slaId, formFields: fields }); showToast('Atualizado!', 'success'); }
    else { await db.addService(categoryId, { name: name, description: desc, slaId: slaId, formFields: fields }); showToast('Criado!', 'success'); }
    closeModal();
    renderAdminCatalogEdit(document.getElementById('content'), categoryId);
}

async function toggleService(categoryId, serviceId) {
    var cat = db.getCategoryById(categoryId);
    var srv = cat.services.find(function(s) { return s.id === serviceId; });
    if (srv) { await db.updateService(categoryId, serviceId, { active: srv.active === false ? true : false }); showToast('Status alterado!', 'success'); renderAdminCatalogEdit(document.getElementById('content'), categoryId); }
}

// ============================================
// ADMIN - SLA
// ============================================
function renderAdminSLA(container) {
    if (!isAdmin()) return;
    var slas = db.data.sla;
    var rows = slas.map(function(s) {
        return '<tr><td><strong>' + s.id + '</strong></td><td>' + escapeHtml(s.name) + '</td><td><strong style="color:var(--primary)">' + s.hours + 'h</strong></td>' +
            '<td><span style="color:' + (s.countWeekends ? 'var(--warning)' : 'var(--success)') + '"><i class="fas fa-' + (s.countWeekends ? 'check' : 'times') + '"></i> ' + (s.countWeekends ? 'Sim (corrido)' : 'Nao (dias uteis)') + '</span></td>' +
            '<td><span class="status-badge ' + (s.active !== false ? 'status-aberto' : 'status-fechado') + '">' + (s.active !== false ? 'Ativo' : 'Inativo') + '</span></td>' +
            '<td><button class="btn btn-sm btn-outline" onclick="showSLAModal(\'' + s.id + '\')"><i class="fas fa-edit"></i></button></td></tr>';
    }).join('');
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-stopwatch"></i> Configurar SLA</h2><button class="btn btn-primary" onclick="showSLAModal()"><i class="fas fa-plus"></i> Novo SLA</button></div>' +
        '<div class="card"><div class="card-body"><table><thead><tr><th>ID</th><th>Nome</th><th>Horas</th><th>Sab/Dom</th><th>Status</th><th>Acoes</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
}

function showSLAModal(slaId) {
    var sla = slaId ? db.getSLAById(slaId) : null;
    var isEdit = !!sla;
    var body = '<form><div class="form-group"><label>Nome *</label><input type="text" id="sla-name" required value="' + (isEdit ? escapeHtml(sla.name) : '') + '"></div>' +
        '<div class="form-group"><label>Horas *</label><input type="number" id="sla-hours" required min="1" value="' + (isEdit ? sla.hours : '48') + '"></div>' +
        '<div class="form-group"><label class="checkbox-group"><input type="checkbox" id="sla-weekends"' + (isEdit && sla.countWeekends ? ' checked' : '') + '> Contar sabado e domingo</label>' +
        '<p style="font-size:12px;color:var(--gray-400);margin-top:4px">Se marcado, conta horas corridas incluindo fins de semana.</p></div></form>';
    var footer = '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button><button class="btn btn-primary" onclick="saveSLA(\'' + (slaId || '') + '\')">' + (isEdit ? 'Salvar' : 'Criar') + '</button>';
    openModal(isEdit ? 'Editar SLA' : 'Novo SLA', body, footer);
}

async function saveSLA(slaId) {
    var name = document.getElementById('sla-name').value.trim();
    var hours = parseInt(document.getElementById('sla-hours').value);
    var weekends = document.getElementById('sla-weekends').checked;
    if (!name || !hours) { showToast('Preencha os campos', 'error'); return; }
    if (slaId) { await db.updateSLA(slaId, { name: name, hours: hours, countWeekends: weekends }); showToast('Atualizado!', 'success'); }
    else { await db.addSLA({ name: name, hours: hours, countWeekends: weekends }); showToast('Criado!', 'success'); }
    closeModal();
    renderAdminSLA(document.getElementById('content'));
}

// ============================================
// ADMIN - SETTINGS
// ============================================
function renderAdminSettings(container) {
    if (!isAdmin()) return;
    var config = {};
    try { config = JSON.parse(localStorage.getItem('rhdesk_github_config') || '{}'); } catch (e) {}
    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-cog"></i> Configuracoes</h2></div>' +
        '<div class="card" style="margin-bottom:24px"><div class="card-header"><h3><i class="fab fa-github" style="margin-right:8px"></i> Integracao GitHub</h3></div><div class="card-body">' +
        '<p style="color:var(--gray-500);margin-bottom:20px">Configure o GitHub para armazenar dados na nuvem.</p>' +
        '<form onsubmit="return saveGitHubConfig(event)">' +
        '<div class="form-group"><label>Personal Access Token *</label><input type="password" id="gh-token" value="' + (config.token || '') + '" placeholder="ghp_xxxx"></div>' +
        '<div class="form-row"><div class="form-group"><label>Owner *</label><input type="text" id="gh-owner" value="' + (config.owner || '') + '"></div>' +
        '<div class="form-group"><label>Repositorio *</label><input type="text" id="gh-repo" value="' + (config.repo || '') + '"></div></div>' +
        '<div style="display:flex;gap:12px"><button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Salvar</button>' +
        '<button type="button" class="btn btn-outline" onclick="testGitHubConnection()"><i class="fas fa-plug"></i> Testar</button>' +
        '<button type="button" class="btn btn-success" onclick="initGitHubRepo()"><i class="fas fa-database"></i> Inicializar Repo</button></div>' +
        '</form></div></div>' +
        '<div class="card" style="margin-bottom:24px"><div class="card-header"><h3>Backup</h3></div><div class="card-body">' +
        '<p style="color:var(--gray-500);margin-bottom:16px">Ultima sync: ' + (db.lastSync ? formatDate(db.lastSync) : 'Nunca') + '</p>' +
        '<div style="display:flex;gap:12px"><button class="btn btn-primary" onclick="forceSyncFromGitHub()"><i class="fas fa-cloud-download-alt"></i> Baixar</button>' +
        '<button class="btn btn-success" onclick="forceSyncToGitHub()"><i class="fas fa-cloud-upload-alt"></i> Enviar</button>' +
        '<button class="btn btn-warning" onclick="db.createBackup()"><i class="fas fa-copy"></i> Backup</button></div></div></div>' +
        '<div class="card"><div class="card-header"><h3>Sobre</h3></div><div class="card-body"><p style="font-size:14px;color:var(--gray-600)"><strong>RH Desk</strong> v1.0<br>' +
        db.data.users.length + ' usuarios, ' + db.data.tickets.length + ' chamados, ' + db.data.catalog.categories.length + ' categorias</p></div></div>';
}

function saveGitHubConfig(event) {
    event.preventDefault();
    var config = { token: document.getElementById('gh-token').value.trim(), owner: document.getElementById('gh-owner').value.trim(), repo: document.getElementById('gh-repo').value.trim() };
    if (!config.token || !config.owner || !config.repo) { showToast('Preencha tudo', 'error'); return false; }
    localStorage.setItem('rhdesk_github_config', JSON.stringify(config));
    githubAPI.configure(config.token, config.owner, config.repo);
    db.useGitHub = true;
    showToast('Salvo!', 'success');
    return false;
}

async function testGitHubConnection() {
    var config = { token: document.getElementById('gh-token').value.trim(), owner: document.getElementById('gh-owner').value.trim(), repo: document.getElementById('gh-repo').value.trim() };
    githubAPI.configure(config.token, config.owner, config.repo);
    showToast('Testando...', 'info');
    var ok = await githubAPI.testConnection();
    showToast(ok ? 'Conexao OK!' : 'Falha na conexao', ok ? 'success' : 'error');
}

async function initGitHubRepo() {
    showToast('Inicializando...', 'info');
    try { await githubAPI.initializeRepo(); showToast('Repositorio pronto!', 'success'); } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function forceSyncFromGitHub() {
    showToast('Baixando...', 'info');
    try { await db.syncFromGitHub(); showToast('Atualizado!', 'success'); navigateTo('dashboard'); } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

async function forceSyncToGitHub() {
    showToast('Enviando...', 'info');
    try {
        var collections = ['users', 'tickets', 'catalog', 'sla', 'messages'];
        for (var i = 0; i < collections.length; i++) await db.syncToGitHub(collections[i]);
        showToast('Enviado!', 'success');
    } catch (e) { showToast('Erro: ' + e.message, 'error'); }
}

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Iniciando RH Desk...');
    try {
        var ghConfig = localStorage.getItem('rhdesk_github_config');
        if (ghConfig) {
            var config = JSON.parse(ghConfig);
            if (config.token && config.owner && config.repo) githubAPI.configure(config.token, config.owner, config.repo);
        }
    } catch (e) {}

    await db.init();

    if (!db.data.users || db.data.users.length === 0) { db.createDefaultData(); db.saveToLocal(); }
    if (!db.data.sla || db.data.sla.length === 0) { db.createDefaultSLA(); db.saveToLocal(); }
    if (!db.data.catalog || !db.data.catalog.categories || db.data.catalog.categories.length === 0) { db.createDefaultCatalog(); db.saveToLocal(); }

    if (checkSession()) showMainApp();
    else showLoginScreen();

    setInterval(async function() {
        if (db.useGitHub && currentUser) { try { await db.syncFromGitHub(); } catch (e) {} }
    }, 300000);

    console.log('RH Desk pronto! Users:', db.data.users.length);
});
