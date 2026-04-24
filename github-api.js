// ============================================
// GITHUB API - Persistência de dados na nuvem
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
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json'
        };
    }

    // Ler arquivo do repositório
    async getFile(path) {
        try {
            const response = await fetch(
                `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`,
                { headers: this.headers }
            );
            if (response.status === 404) return null;
            if (!response.ok) throw new Error(`GitHub API Error: ${response.status}`);

            const data = await response.json();
            this.shaCache[path] = data.sha;

            const content = atob(data.content.replace(/\n/g, ''));
            // Decode UTF-8
            const bytes = new Uint8Array(content.length);
            for (let i = 0; i < content.length; i++) {
                bytes[i] = content.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
        } catch (error) {
            console.error(`Erro ao ler ${path}:`, error);
            return null;
        }
    }

    // Salvar/Atualizar arquivo
    async saveFile(path, content, message = 'Update data') {
        try {
            // Encode para UTF-8 Base64
            const encoder = new TextEncoder();
            const data = encoder.encode(content);
            let binary = '';
            for (let i = 0; i < data.length; i++) {
                binary += String.fromCharCode(data[i]);
            }
            const base64Content = btoa(binary);

            const body = {
                message: message,
                content: base64Content,
                branch: this.branch
            };

            // Se o arquivo já existe, precisamos do SHA
            if (this.shaCache[path]) {
                body.sha = this.shaCache[path];
            } else {
                // Tentar obter SHA
                const existing = await this.getFile(path);
                if (this.shaCache[path]) {
                    body.sha = this.shaCache[path];
                }
            }

            const response = await fetch(
                `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`,
                {
                    method: 'PUT',
                    headers: this.headers,
                    body: JSON.stringify(body)
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`GitHub API Error: ${response.status} - ${JSON.stringify(errorData)}`);
            }

            const result = await response.json();
            this.shaCache[path] = result.content.sha;
            return result;
        } catch (error) {
            console.error(`Erro ao salvar ${path}:`, error);
            throw error;
        }
    }

    // Upload de arquivo binário (anexos)
    async uploadFile(path, file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const base64 = reader.result.split(',')[1];
                    const body = {
                        message: `Upload attachment: ${file.name}`,
                        content: base64,
                        branch: this.branch
                    };

                    // Verificar se já existe
                    if (this.shaCache[path]) {
                        body.sha = this.shaCache[path];
                    }

                    const response = await fetch(
                        `${this.baseUrl}/repos/${this.owner}/${this.repo}/contents/${path}`,
                        {
                            method: 'PUT',
                            headers: this.headers,
                            body: JSON.stringify(body)
                        }
                    );

                    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

                    const result = await response.json();
                    this.shaCache[path] = result.content.sha;
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Obter URL de download do arquivo
    getDownloadUrl(path) {
        return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;
    }

    // Verificar conexão
    async testConnection() {
        try {
            const response = await fetch(
                `${this.baseUrl}/repos/${this.owner}/${this.repo}`,
                { headers: this.headers }
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    // Criar estrutura inicial do repositório
    async initializeRepo() {
        const files = {
            'db/users.json': JSON.stringify([
                {
                    id: 'USR001',
                    name: 'Administrador',
                    email: 'admin@empresa.com',
                    password: 'admin123',
                    role: 'admin',
                    active: true,
                    createdAt: new Date().toISOString()
                }
            ], null, 2),
            'db/tickets.json': JSON.stringify([], null, 2),
            'db/catalog.json': JSON.stringify({
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
                            { id: 'SRV007', name: 'Inclusão em benefício', description: 'Solicitar inclusão em vale-transporte, VA/VR ou plano de saúde', formFields: ['description', 'benefitType'], slaId: 'SLA002', active: true },
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
                            { id: 'SRV013', name: 'Antecipação de 13º nas férias', description: 'Solicitar antecipação do 13º salário junto com as férias', formFields: ['description'], slaId: 'SLA002', active: true }
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
                            { id: 'SRV015', name: 'Atualização cadastral', description: 'Atualizar dados cadastrais (endereço, telefone, etc.)', formFields: ['description'], slaId: 'SLA001', active: true }
                        ]
                    }
                ]
            }, null, 2),
            'db/sla.json': JSON.stringify([
                { id: 'SLA001', name: 'Padrão', hours: 48, countWeekends: false, active: true },
                { id: 'SLA002', name: 'Intermediário', hours: 72, countWeekends: false, active: true },
                { id: 'SLA003', name: 'Longo', hours: 120, countWeekends: false, active: true },
                { id: 'SLA004', name: 'Urgente', hours: 24, countWeekends: true, active: true }
            ], null, 2),
            'db/messages.json': JSON.stringify([], null, 2)
        };

        for (const [path, content] of Object.entries(files)) {
            try {
                await this.saveFile(path, content, `Initialize ${path}`);
                console.log(`✅ Criado: ${path}`);
            } catch (e) {
                console.log(`⚠️ ${path} já existe ou erro:`, e.message);
            }
        }
    }
}

// Instância global
const githubAPI = new GitHubAPI();
