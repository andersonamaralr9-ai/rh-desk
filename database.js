// ============================================
// DATABASE - Gerenciamento local + sincronização
// ============================================

class Database {
    constructor() {
        this.data = {
            users: [],
            tickets: [],
            catalog: { categories: [] },
            sla: [],
            messages: []
        };
        this.syncQueue = [];
        this.isSyncing = false;
        this.useGitHub = false;
        this.lastSync = null;
    }

    // Inicializar
    async init() {
        // Carregar do localStorage primeiro
        this.loadFromLocal();

        // Tentar sincronizar com GitHub
        if (githubAPI.token) {
            this.useGitHub = true;
            try {
                await this.syncFromGitHub();
                showToast('Dados sincronizados com a nuvem', 'success');
            } catch (e) {
                console.warn('Usando dados locais:', e);
            }
        }

        // Se não há usuários, criar dados padrão
        if (!this.data.users || this.data.users.length === 0) {
            console.log('Criando dados iniciais...');
            this.createDefaultData();
            this.saveToLocal();
        }

        // Garantir que catalog tem estrutura correta
        if (!this.data.catalog || !this.data.catalog.categories || this.data.catalog.categories.length === 0) {
            console.log('Criando catálogo padrão...');
            this.createDefaultCatalog();
            this.saveToLocal();
        }

        // Garantir que SLA existe
        if (!this.data.sla || this.data.sla.length === 0) {
            console.log('Criando SLAs padrão...');
            this.createDefaultSLA();
            this.saveToLocal();
        }
    }

    createDefaultData() {
        this.data.users = [
            {
                id: 'USR001',
                name: 'Administrador',
                email: 'admin@empresa.com',
                password: 'admin123',
                role: 'admin',
                active: true,
                createdAt: new Date().toISOString()
            }
        ];
        this.data.tickets = [];
        this.data.messages = [];
        this.createDefaultSLA();
        this.createDefaultCatalog();
    }

    createDefaultSLA() {
        this.data.sla = [
            { id: 'SLA001', name: 'Padrão', hours: 48, countWeekends: false, active: true },
            { id: 'SLA002', name: 'Intermediário', hours: 72, countWeekends: false, active: true },
            { id: 'SLA003', name: 'Longo', hours: 120, countWeekends: false, active: true },
            { id: 'SLA004', name: 'Urgente', hours: 24, countWeekends: true, active: true }
        ];
    }

    createDefaultCatalog() {
        this.data.catalog = {
            categories: [
                {
                    id: 'CAT001',
                    name: 'Folha de Pagamento',
                    description: 'Serviços relacionados à folha de pagamento, contracheques e remuneração',
                    icon: 'fa-money-bill-wave',
                    color: '#059669',
                    active: true,
                    services: [
                        { id: 'SRV001', name: 'Dúvida sobre contracheque', description: 'Esclarecimentos sobre valores, descontos e proventos', formFields: ['description'], slaId: 'SLA001', active: true },
                        { id: 'SRV002', name: 'Correção de pagamento', description: 'Solicitar correção de valores pagos incorretamente', formFields: ['description', 'monthRef', 'amount'], slaId: 'SLA002', active: true },
                        { id: 'SRV003', name: 'Informe de rendimentos', description: 'Solicitar informe de rendimentos para IR', formFields: ['description', 'yearRef'], slaId: 'SLA001', active: true }
                    ]
                },
                {
                    id: 'CAT002',
                    name: 'Frequência',
                    description: 'Gestão de ponto, faltas, atrasos e jornada de trabalho',
                    icon: 'fa-clock',
                    color: '#2563eb',
                    active: true,
                    services: [
                        { id: 'SRV004', name: 'Ajuste de ponto', description: 'Solicitar ajuste de registro de ponto', formFields: ['description', 'date', 'time'], slaId: 'SLA001', active: true },
                        { id: 'SRV005', name: 'Abono de falta', description: 'Solicitar abono de falta mediante justificativa', formFields: ['description', 'date', 'justification'], slaId: 'SLA002', active: true },
                        { id: 'SRV006', name: 'Banco de horas', description: 'Consulta ou ajuste de banco de horas', formFields: ['description'], slaId: 'SLA001', active: true }
                    ]
                },
                {
                    id: 'CAT003',
                    name: 'Benefícios',
                    description: 'Vale-transporte, vale-refeição, plano de saúde e outros benefícios',
                    icon: 'fa-gift',
                    color: '#7c3aed',
                    active: true,
                    services: [
                        { id: 'SRV007', name: 'Inclusão em benefício', description: 'Solicitar inclusão em VT, VA/VR ou plano de saúde', formFields: ['description', 'benefitType'], slaId: 'SLA002', active: true },
                        { id: 'SRV008', name: 'Alteração de benefício', description: 'Alterar dados de benefício existente', formFields: ['description', 'benefitType'], slaId: 'SLA002', active: true },
                        { id: 'SRV009', name: 'Exclusão de benefício', description: 'Solicitar exclusão de benefício', formFields: ['description', 'benefitType'], slaId: 'SLA001', active: true }
                    ]
                },
                {
                    id: 'CAT004',
                    name: 'Treinamento',
                    description: 'Capacitações, cursos, treinamentos e desenvolvimento profissional',
                    icon: 'fa-graduation-cap',
                    color: '#d97706',
                    active: true,
                    services: [
                        { id: 'SRV010', name: 'Solicitar treinamento', description: 'Solicitar participação em treinamento ou curso', formFields: ['description', 'courseName', 'justification'], slaId: 'SLA003', active: true },
                        { id: 'SRV011', name: 'Certificado de treinamento', description: 'Solicitar certificado de treinamento realizado', formFields: ['description', 'courseName'], slaId: 'SLA001', active: true }
                    ]
                },
                {
                    id: 'CAT005',
                    name: 'Férias',
                    description: 'Programação, antecipação e dúvidas sobre férias',
                    icon: 'fa-umbrella-beach',
                    color: '#0891b2',
                    active: true,
                    services: [
                        { id: 'SRV012', name: 'Programação de férias', description: 'Solicitar ou alterar programação de férias', formFields: ['description', 'startDate', 'endDate'], slaId: 'SLA002', active: true },
                        { id: 'SRV013', name: 'Antecipação de 13º nas férias', description: 'Solicitar antecipação do 13º salário', formFields: ['description'], slaId: 'SLA002', active: true }
                    ]
                },
                {
                    id: 'CAT006',
                    name: 'Documentos',
                    description: 'Declarações, atestados, certidões e outros documentos',
                    icon: 'fa-file-alt',
                    color: '#dc2626',
                    active: true,
                    services: [
                        { id: 'SRV014', name: 'Declaração de vínculo', description: 'Solicitar declaração de vínculo empregatício', formFields: ['description', 'purpose'], slaId: 'SLA001', active: true },
                        { id: 'SRV015', name: 'Atualização cadastral', description: 'Atualizar dados cadastrais', formFields: ['description'], slaId: 'SLA001', active: true }
                    ]
                }
            ]
        };
    }

    // Salvar no localStorage
    saveToLocal() {
        try {
            localStorage.setItem('rhdesk_users', JSON.stringify(this.data.users));
            localStorage.setItem('rhdesk_tickets', JSON.stringify(this.data.tickets));
            localStorage.setItem('rhdesk_catalog', JSON.stringify(this.data.catalog));
            localStorage.setItem('rhdesk_sla', JSON.stringify(this.data.sla));
            localStorage.setItem('rhdesk_messages', JSON.stringify(this.data.messages));
            localStorage.setItem('rhdesk_lastSync', new Date().toISOString());
        } catch (e) {
            console.error('Erro ao salvar localmente:', e);
        }
    }

    // Carregar do localStorage
    loadFromLocal() {
        try {
            const users = localStorage.getItem('rhdesk_users');
            const tickets = localStorage.getItem('rhdesk_tickets');
            const catalog = localStorage.getItem('rhdesk_catalog');
            const sla = localStorage.getItem('rhdesk_sla');
            const messages = localStorage.getItem('rhdesk_messages');

            if (users) this.data.users = JSON.parse(users);
            if (tickets) this.data.tickets = JSON.parse(tickets);
            if (catalog) this.data.catalog = JSON.parse(catalog);
            if (sla) this.data.sla = JSON.parse(sla);
            if (messages) this.data.messages = JSON.parse(messages);

            this.lastSync = localStorage.getItem('rhdesk_lastSync');
        } catch (e) {
            console.error('Erro ao carregar dados locais:', e);
        }
    }

    // Sincronizar FROM GitHub
    async syncFromGitHub() {
        if (!this.useGitHub) return;

        try {
            const [users, tickets, catalog, sla, messages] = await Promise.all([
                githubAPI.getFile('db/users.json'),
                githubAPI.getFile('db/tickets.json'),
                githubAPI.getFile('db/catalog.json'),
                githubAPI.getFile('db/sla.json'),
                githubAPI.getFile('db/messages.json')
            ]);

            if (users) this.data.users = JSON.parse(users);
            if (tickets) this.data.tickets = JSON.parse(tickets);
            if (catalog) this.data.catalog = JSON.parse(catalog);
            if (sla) this.data.sla = JSON.parse(sla);
            if (messages) this.data.messages = JSON.parse(messages);

            this.saveToLocal();
            this.lastSync = new Date().toISOString();
        } catch (error) {
            console.error('Erro na sincronização:', error);
            throw error;
        }
    }

    // Sincronizar TO GitHub
    async syncToGitHub(collection) {
        if (!this.useGitHub) {
            this.saveToLocal();
            return;
        }

        this.saveToLocal();

        const fileMap = {
            users: 'db/users.json',
            tickets: 'db/tickets.json',
            catalog: 'db/catalog.json',
            sla: 'db/sla.json',
            messages: 'db/messages.json'
        };

        if (collection && fileMap[collection]) {
            try {
                await githubAPI.saveFile(
                    fileMap[collection],
                    JSON.stringify(this.data[collection], null, 2),
                    `Update ${collection} - ${new Date().toLocaleString('pt-BR')}`
                );
            } catch (error) {
                console.error(`Erro ao sincronizar ${collection}:`, error);
                this.syncQueue.push({ collection, timestamp: Date.now() });
            }
        }
    }

    // Retry de sincronizações pendentes
    async processSyncQueue() {
        if (this.syncQueue.length === 0 || this.isSyncing) return;
        this.isSyncing = true;

        while (this.syncQueue.length > 0) {
            const item = this.syncQueue.shift();
            try {
                await this.syncToGitHub(item.collection);
            } catch (e) {
                if (!item.retries || item.retries < 3) {
                    item.retries = (item.retries || 0) + 1;
                    this.syncQueue.push(item);
                }
            }
        }

        this.isSyncing = false;
    }

    // Fazer backup completo
    async createBackup() {
        if (!this.useGitHub) return;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backup = JSON.stringify(this.data, null, 2);

        try {
            await githubAPI.saveFile(
                `backups/backup_${timestamp}.json`,
                backup,
                `Backup - ${new Date().toLocaleString('pt-BR')}`
            );
            showToast('Backup realizado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro no backup:', error);
            showToast('Erro ao realizar backup', 'error');
        }
    }

    // === CRUD USERS ===
    getUsers() { return this.data.users.filter(u => u.active !== false); }
    getAllUsers() { return this.data.users; }

    getUserById(id) { return this.data.users.find(u => u.id === id); }

    getUserByEmail(email) {
        return this.data.users.find(u => u.email.toLowerCase() === email.toLowerCase() && u.active !== false);
    }

    async addUser(user) {
        const maxId = this.data.users.reduce((max, u) => {
            const num = parseInt(u.id.replace('USR', ''));
            return num > max ? num : max;
        }, 0);
        user.id = 'USR' + String(maxId + 1).padStart(3, '0');
        user.createdAt = new Date().toISOString();
        user.active = true;
        this.data.users.push(user);
        await this.syncToGitHub('users');
        return user;
    }

    async updateUser(id, updates) {
        const index = this.data.users.findIndex(u => u.id === id);
        if (index >= 0) {
            this.data.users[index] = { ...this.data.users[index], ...updates };
            await this.syncToGitHub('users');
            return this.data.users[index];
        }
        return null;
    }

    async deleteUser(id) {
        const index = this.data.users.findIndex(u => u.id === id);
        if (index >= 0) {
            this.data.users[index].active = false;
            await this.syncToGitHub('users');
        }
    }

    // === CRUD TICKETS ===
    getTickets(filter = {}) {
        let tickets = [...this.data.tickets];

        if (filter.userId) {
            tickets = tickets.filter(t => t.createdBy === filter.userId);
        }
        if (filter.assignedTo) {
            tickets = tickets.filter(t => t.assignedTo === filter.assignedTo);
        }
        if (filter.status) {
            tickets = tickets.filter(t => t.status === filter.status);
        }
        if (filter.category) {
            tickets = tickets.filter(t => t.categoryId === filter.category);
        }
        if (filter.search) {
            const s = filter.search.toLowerCase();
            tickets = tickets.filter(t =>
                t.id.toLowerCase().includes(s) ||
                t.subject.toLowerCase().includes(s) ||
                t.description.toLowerCase().includes(s)
            );
        }

        return tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    getTicketById(id) { return this.data.tickets.find(t => t.id === id); }

    async addTicket(ticket) {
        const count = this.data.tickets.length + 1;
        const year = new Date().getFullYear();
        ticket.id = `CHM-${year}-${String(count).padStart(5, '0')}`;
        ticket.createdAt = new Date().toISOString();
        ticket.updatedAt = new Date().toISOString();
        ticket.status = 'aberto';
        ticket.history = [{
            action: 'Chamado aberto',
            by: ticket.createdBy,
            at: ticket.createdAt,
            details: 'Chamado criado no sistema'
        }];

        const sla = this.getSLAById(ticket.slaId);
        if (sla) {
            ticket.slaDeadline = this.calculateSLADeadline(ticket.createdAt, sla);
            ticket.slaHours = sla.hours;
            ticket.slaCountWeekends = sla.countWeekends;
        }

        this.data.tickets.push(ticket);
        await this.syncToGitHub('tickets');
        return ticket;
    }

    async updateTicket(id, updates) {
        const index = this.data.tickets.findIndex(t => t.id === id);
        if (index >= 0) {
            updates.updatedAt = new Date().toISOString();
            this.data.tickets[index] = { ...this.data.tickets[index], ...updates };
            await this.syncToGitHub('tickets');
            return this.data.tickets[index];
        }
        return null;
    }

    async addTicketHistory(ticketId, action, userId, details = '') {
        const ticket = this.getTicketById(ticketId);
        if (ticket) {
            if (!ticket.history) ticket.history = [];
            ticket.history.push({
                action, by: userId, at: new Date().toISOString(), details
            });
            ticket.updatedAt = new Date().toISOString();
            await this.syncToGitHub('tickets');
        }
    }

    // === CRUD MESSAGES ===
    getMessages(ticketId) {
        return this.data.messages
            .filter(m => m.ticketId === ticketId)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    }

    async addMessage(message) {
        message.id = 'MSG' + Date.now() + Math.random().toString(36).substr(2, 4);
        message.createdAt = new Date().toISOString();
        this.data.messages.push(message);
        await this.syncToGitHub('messages');
        return message;
    }

    // === CRUD CATALOG ===
    getCategories() { return this.data.catalog.categories.filter(c => c.active !== false); }
    getAllCategories() { return this.data.catalog.categories; }

    getCategoryById(id) { return this.data.catalog.categories.find(c => c.id === id); }

    getServiceById(serviceId) {
        for (const cat of this.data.catalog.categories) {
            const service = cat.services.find(s => s.id === serviceId);
            if (service) return { ...service, category: cat };
        }
        return null;
    }

    async addCategory(category) {
        const maxId = this.data.catalog.categories.reduce((max, c) => {
            const num = parseInt(c.id.replace('CAT', ''));
            return num > max ? num : max;
        }, 0);
        category.id = 'CAT' + String(maxId + 1).padStart(3, '0');
        category.active = true;
        category.services = category.services || [];
        this.data.catalog.categories.push(category);
        await this.syncToGitHub('catalog');
        return category;
    }

    async updateCategory(id, updates) {
        const index = this.data.catalog.categories.findIndex(c => c.id === id);
        if (index >= 0) {
            this.data.catalog.categories[index] = { ...this.data.catalog.categories[index], ...updates };
            await this.syncToGitHub('catalog');
            return this.data.catalog.categories[index];
        }
        return null;
    }

    async addService(categoryId, service) {
        const category = this.getCategoryById(categoryId);
        if (category) {
            service.id = 'SRV' + Date.now().toString().slice(-6);
            service.active = true;
            category.services.push(service);
            await this.syncToGitHub('catalog');
            return service;
        }
        return null;
    }

    async updateService(categoryId, serviceId, updates) {
        const category = this.getCategoryById(categoryId);
        if (category) {
            const index = category.services.findIndex(s => s.id === serviceId);
            if (index >= 0) {
                category.services[index] = { ...category.services[index], ...updates };
                await this.syncToGitHub('catalog');
                return category.services[index];
            }
        }
        return null;
    }

    // === CRUD SLA ===
    getSLAs() { return this.data.sla.filter(s => s.active !== false); }
    getSLAById(id) { return this.data.sla.find(s => s.id === id); }

    async addSLA(sla) {
        const maxId = this.data.sla.reduce((max, s) => {
            const num = parseInt(s.id.replace('SLA', ''));
            return num > max ? num : max;
        }, 0);
        sla.id = 'SLA' + String(maxId + 1).padStart(3, '0');
        sla.active = true;
        this.data.sla.push(sla);
        await this.syncToGitHub('sla');
        return sla;
    }

    async updateSLA(id, updates) {
        const index = this.data.sla.findIndex(s => s.id === id);
        if (index >= 0) {
            this.data.sla[index] = { ...this.data.sla[index], ...updates };
            await this.syncToGitHub('sla');
            return this.data.sla[index];
        }
        return null;
    }

    // === SLA CALCULATION ===
    calculateSLADeadline(startDate, sla) {
        let deadline = new Date(startDate);
        let hoursRemaining = sla.hours;

        while (hoursRemaining > 0) {
            deadline.setHours(deadline.getHours() + 1);

            if (!sla.countWeekends) {
                const day = deadline.getDay();
                if (day === 0 || day === 6) continue;
            }

            hoursRemaining--;
        }

        return deadline.toISOString();
    }

    getSLAStatus(ticket) {
        if (!ticket.slaDeadline) return { percent: 0, status: 'none', text: 'SLA não definido' };
        if (ticket.status === 'fechado' || ticket.status === 'cancelado') {
            return { percent: 100, status: 'completed', text: 'Chamado encerrado' };
        }

        const now = new Date();
        const created = new Date(ticket.createdAt);
        const deadline = new Date(ticket.slaDeadline);
        const total = deadline - created;
        const elapsed = now - created;
        const percent = Math.min(100, Math.round((elapsed / total) * 100));

        let status = 'ok';
        let text = '';

        if (now > deadline) {
            status = 'danger';
            const overdue = Math.round((now - deadline) / (1000 * 60 * 60));
            text = `SLA estourado há ${overdue}h`;
        } else {
            const remaining = Math.round((deadline - now) / (1000 * 60 * 60));
            if (percent >= 75) {
                status = 'warning';
                text = `${remaining}h restantes (atenção!)`;
            } else {
                status = 'ok';
                text = `${remaining}h restantes`;
            }
        }

        return { percent, status, text };
    }
}

// Instância global
const db = new Database();
