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
            const item = this.syncQueue.shift();<span class="cursor">█</span>
