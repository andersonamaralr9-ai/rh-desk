// ============================================
// GITHUB AUTO-CONFIG - Substitui tela de configurações
// Só precisa do Token. Owner e Repo são detectados automaticamente.
// ============================================

// Adicionar métodos ao GitHubAPI
githubAPI.autoDetectUser = async function(token) {
    var response = await fetch('https://api.github.com/user', {
        headers: {
            'Authorization': 'Bearer ' + token,
            'Accept': 'application/vnd.github+json'
        }
    });
    if (!response.ok) throw new Error('Token invalido');
    var data = await response.json();
    return data.login;
};

githubAPI.ensureRepoExists = async function(token, owner, repoName) {
    var headers = {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
    };
    // Verificar se repo existe
    var check = await fetch('https://api.github.com/repos/' + owner + '/' + repoName, { headers: headers });
    if (check.ok) return { created: false, name: repoName };
    // Criar repo
    var create = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            name: repoName,
            description: 'RH Desk - Base de dados na nuvem',
            private: false,
            auto_init: true
        })
    });
    if (!create.ok) {
        var err = await create.json();
        throw new Error(err.message || 'Erro ao criar repositorio');
    }
    // Aguardar repo ficar disponivel
    await new Promise(function(r) { setTimeout(r, 2000); });
    return { created: true, name: repoName };
};

// Sobrescrever a tela de configurações
renderAdminSettings = function(container) {
    var savedConfig = null;
    try { savedConfig = JSON.parse(localStorage.getItem('rhdesk_github_config')); } catch(e) {}

    var isConnected = savedConfig && savedConfig.token && githubAPI.token;
    var statusHtml = '';
    if (isConnected) {
        statusHtml = '<div style="background:#ecfdf5;border:1px solid #059669;border-radius:8px;padding:16px;margin-bottom:24px;">' +
            '<div style="display:flex;align-items:center;gap:8px;color:#059669;font-weight:600;margin-bottom:8px;">' +
            '<i class="fas fa-check-circle"></i> Conectado ao GitHub</div>' +
            '<div style="font-size:13px;color:#374151;">' +
            '<div><strong>Usuario:</strong> ' + escapeHtml(savedConfig.owner) + '</div>' +
            '<div><strong>Repositorio:</strong> ' + escapeHtml(savedConfig.repo) + '</div>' +
            '<div><strong>Ultima sincronizacao:</strong> ' + (db.lastSync ? formatDate(db.lastSync) : 'Nunca') + '</div>' +
            '</div></div>';
    }

    container.innerHTML = '<div class="page-header"><h2><i class="fas fa-cog"></i> Configuracoes</h2></div>' +
        '<div class="card"><div class="card-header"><h3><i class="fab fa-github"></i> Integracao GitHub (Nuvem)</h3></div>' +
        '<div class="card-body">' +
        statusHtml +
        '<p style="color:var(--gray-500);margin-bottom:16px;">Cole seu Personal Access Token do GitHub. O sistema detecta seu usuario e cria o repositorio automaticamente.</p>' +
        '<div style="background:#eff6ff;border:1px solid #3b82f6;border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:#1e40af;">' +
        '<i class="fas fa-info-circle"></i> <strong>Como gerar o token:</strong> GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate. ' +
        'Permissao necessaria: <strong>Contents: Read and write</strong>.</div>' +
        '<div class="form-group"><label>Personal Access Token *</label>' +
        '<input type="password" id="gh-token" placeholder="github_pat_..." value="' + (savedConfig ? savedConfig.token : '') + '" style="font-family:monospace;"></div>' +
        '<div style="display:flex;gap:12px;flex-wrap:wrap;">' +
        '<button class="btn btn-primary" onclick="autoConfigGitHub()" id="btn-auto-config">' +
        '<i class="fas fa-magic"></i> Configurar Automaticamente</button>' +
        (isConnected ? '<button class="btn btn-success" onclick="syncNow()"><i class="fas fa-sync"></i> Sincronizar Agora</button>' +
        '<button class="btn btn-secondary" onclick="backupNow()"><i class="fas fa-download"></i> Fazer Backup</button>' +
        '<button class="btn btn-danger" onclick="disconnectGitHub()"><i class="fas fa-unlink"></i> Desconectar</button>' : '') +
        '</div>' +
        '<div id="config-log" style="margin-top:20px;"></div>' +
        '</div></div>' +
        '<div class="card" style="margin-top:20px;"><div class="card-header"><h3><i class="fas fa-database"></i> Dados Locais</h3></div>' +
        '<div class="card-body">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px;">' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.users.length + '</div><div style="font-size:12px;color:var(--gray-400);">Usuarios</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.tickets.length + '</div><div style="font-size:12px;color:var(--gray-400);">Chamados</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.catalog.categories.length + '</div><div style="font-size:12px;color:var(--gray-400);">Categorias</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.messages.length + '</div><div style="font-size:12px;color:var(--gray-400);">Mensagens</div></div>' +
        '</div>' +
        '<button class="btn btn-danger btn-sm" onclick="if(confirm(\'Tem certeza? Isso apaga TODOS os dados locais!\')){localStorage.clear();location.reload();}">' +
        '<i class="fas fa-trash"></i> Limpar Dados Locais</button>' +
        '</div></div>';
};

async function autoConfigGitHub() {
    var token = document.getElementById('gh-token').value.trim();
    if (!token) { showToast('Informe o token!', 'error'); return; }

    var btn = document.getElementById('btn-auto-config');
    var log = document.getElementById('config-log');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Configurando...';
    log.innerHTML = '';

    function addLog(icon, color, text) {
        log.innerHTML += '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;color:' + color + ';font-size:14px;">' +
            '<i class="fas ' + icon + '"></i> ' + text + '</div>';
    }

    try {
        // 1. Detectar usuario
        addLog('fa-spinner fa-spin', '#6b7280', 'Verificando token...');
        var owner = await githubAPI.autoDetectUser(token);
        log.innerHTML = '';
        addLog('fa-check-circle', '#059669', 'Usuario detectado: <strong>' + owner + '</strong>');

        // 2. Verificar/criar repositorio
        addLog('fa-spinner fa-spin', '#6b7280', 'Verificando repositorio rh-desk-data...');
        var repoResult = await githubAPI.ensureRepoExists(token, owner, 'rh-desk-data');
        if (repoResult.created) {
            addLog('fa-plus-circle', '#059669', 'Repositorio <strong>rh-desk-data</strong> criado com sucesso!');
        } else {
            addLog('fa-check-circle', '#059669', 'Repositorio <strong>rh-desk-data</strong> encontrado!');
        }

        // 3. Configurar API
        githubAPI.configure(token, owner, 'rh-desk-data');
        db.useGitHub = true;

        // 4. Salvar config
        var config = { token: token, owner: owner, repo: 'rh-desk-data' };
        localStorage.setItem('rhdesk_github_config', JSON.stringify(config));
        addLog('fa-save', '#059669', 'Configuracao salva!');

        // 5. Inicializar dados no repo
        addLog('fa-spinner fa-spin', '#6b7280', 'Inicializando dados no repositorio...');
        await githubAPI.initializeRepo();
        addLog('fa-database', '#059669', 'Dados inicializados no GitHub!');

        // 6. Sincronizar
        addLog('fa-spinner fa-spin', '#6b7280', 'Sincronizando...');
        await db.syncFromGitHub();
        addLog('fa-cloud-upload-alt', '#059669', 'Sincronizacao concluida!');

        addLog('fa-check-double', '#059669', '<strong>Tudo pronto! Seus dados agora sao salvos na nuvem.</strong>');
        showToast('GitHub configurado com sucesso!', 'success');

        // Recarregar a tela apos 2 segundos
        setTimeout(function() { renderAdminSettings(document.getElementById('content')); }, 2000);

    } catch (error) {
        addLog('fa-times-circle', '#dc2626', 'Erro: ' + error.message);
        showToast('Erro na configuracao: ' + error.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic"></i> Configurar Automaticamente';
}

async function syncNow() {
    showToast('Sincronizando...', 'info');
    try {
        await db.syncToGitHub('users');
        await db.syncToGitHub('tickets');
        await db.syncToGitHub('catalog');
        await db.syncToGitHub('sla');
        await db.syncToGitHub('messages');
        showToast('Sincronizacao concluida!', 'success');
        renderAdminSettings(document.getElementById('content'));
    } catch (e) {
        showToast('Erro na sincronizacao: ' + e.message, 'error');
    }
}

async function backupNow() {
    showToast('Criando backup...', 'info');
    await db.createBackup();
}

function disconnectGitHub() {
    if (!confirm('Deseja desconectar do GitHub? Os dados locais serao mantidos.')) return;
    localStorage.removeItem('rhdesk_github_config');
    githubAPI.token = '';
    githubAPI.owner = '';
    githubAPI.repo = '';
    db.useGitHub = false;
    showToast('GitHub desconectado', 'info');
    renderAdminSettings(document.getElementById('content'));
}
