// ============================================
// GITHUB AUTO-CONFIG
// Token só precisa ser informado 1x pelo admin.
// Demais máquinas sincronizam automaticamente.
// ============================================

// === CONFIG GLOBAL - sera preenchido pelo admin ===
var RHDESK_CLOUD = {
    owner: 'andersonamaralr9-ai',
    repo: 'rh-desk-data'
};

// Tentar carregar config salva
(function loadCloudConfig() {
    try {
        var cfg = localStorage.getItem('rhdesk_github_config');
        if (cfg) {
            var parsed = JSON.parse(cfg);
            if (parsed.owner) RHDESK_CLOUD.owner = parsed.owner;
            if (parsed.repo) RHDESK_CLOUD.repo = parsed.repo;
        }
    } catch(e) {}
})();

// === Auto-detectar usuario pelo token ===
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

// === Verificar/criar repositorio ===
githubAPI.ensureRepoExists = async function(token, owner, repoName) {
    var headers = {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
    };
    var check = await fetch('https://api.github.com/repos/' + owner + '/' + repoName, { headers: headers });
    if (check.ok) return { created: false };
    var create = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
            name: repoName,
            description: 'RH Desk - Base de dados',
            private: false,
            auto_init: true
        })
    });
    if (!create.ok) {
        var err = await create.json();
        throw new Error(err.message || 'Erro ao criar repositorio');
    }
    await new Promise(function(r) { setTimeout(r, 2000); });
    return { created: true };
};

// === Buscar dados da nuvem SEM token (repo publico) ===
async function fetchPublicData(owner, repo) {
    var baseUrl = 'https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/';
    var files = ['db/users.json', 'db/tickets.json', 'db/catalog.json', 'db/sla.json', 'db/messages.json'];
    var results = {};
    for (var i = 0; i < files.length; i++) {
        try {
            var response = await fetch(baseUrl + files[i] + '?t=' + Date.now());
            if (response.ok) {
                var text = await response.text();
                var key = files[i].replace('db/', '').replace('.json', '');
                results[key] = JSON.parse(text);
            }
        } catch(e) {
            console.warn('Erro ao buscar ' + files[i] + ':', e);
        }
    }
    return results;
}

// === Sincronizar na inicializacao (para qualquer maquina) ===
async function cloudSyncOnLoad() {
    // Se ja tem token configurado, usar API autenticada
    var cfg = null;
    try { cfg = JSON.parse(localStorage.getItem('rhdesk_github_config')); } catch(e) {}
    
    if (cfg && cfg.token && cfg.owner && cfg.repo) {
        // Maquina ja configurada - sync autenticado
        githubAPI.configure(cfg.token, cfg.owner, cfg.repo);
        db.useGitHub = true;
        try {
            await db.syncFromGitHub();
            console.log('Sync autenticado OK');
            return true;
        } catch(e) {
            console.warn('Sync autenticado falhou:', e);
        }
    }
    
    // Tentar sync publico (repo publico)
    // Buscar owner salvo OU de config global
    var owner = '';
    if (cfg && cfg.owner) {
        owner = cfg.owner;
    } else {
        // Verificar se existe arquivo de config no localStorage de outra sessao
        try {
            var globalCfg = localStorage.getItem('rhdesk_cloud_owner');
            if (globalCfg) owner = globalCfg;
        } catch(e) {}
    }
    
    if (!owner) {
        console.log('Nenhuma config de nuvem encontrada - usando dados locais');
        return false;
    }
    
    var repo = (cfg && cfg.repo) ? cfg.repo : 'rh-desk-data';
    
    try {
        console.log('Tentando sync publico: ' + owner + '/' + repo);
        var cloudData = await fetchPublicData(owner, repo);
        
        if (cloudData.users && cloudData.users.length > 0) {
            db.data.users = cloudData.users;
            console.log('Users da nuvem:', cloudData.users.length);
        }
        if (cloudData.tickets) db.data.tickets = cloudData.tickets;
        if (cloudData.catalog && cloudData.catalog.categories) db.data.catalog = cloudData.catalog;
        if (cloudData.sla && cloudData.sla.length > 0) db.data.sla = cloudData.sla;
        if (cloudData.messages) db.data.messages = cloudData.messages;
        
        db.saveToLocal();
        localStorage.setItem('rhdesk_cloud_owner', owner);
        console.log('Sync publico OK');
        return true;
    } catch(e) {
        console.warn('Sync publico falhou:', e);
        return false;
    }
}

// === Tela de configuracoes (so admin) ===
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
        '<p style="color:var(--gray-500);margin-bottom:16px;">Cole seu Personal Access Token do GitHub. O sistema detecta seu usuario e configura tudo automaticamente.</p>' +
        '<div style="background:#eff6ff;border:1px solid #3b82f6;border-radius:8px;padding:12px;margin-bottom:20px;font-size:13px;color:#1e40af;">' +
        '<i class="fas fa-info-circle"></i> <strong>Como gerar o token:</strong> GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate. ' +
        'Permissao necessaria: <strong>Contents: Read and write</strong>.' +
        '<br><br><i class="fas fa-globe"></i> <strong>Importante:</strong> Depois de configurar aqui, qualquer usuario podera fazer login de qualquer computador automaticamente (o repositorio e publico).</div>' +
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
        '<div class="card" style="margin-top:20px;"><div class="card-header"><h3><i class="fas fa-database"></i> Dados</h3></div>' +
        '<div class="card-body">' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin-bottom:16px;">' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.users.length + '</div><div style="font-size:12px;color:var(--gray-400);">Usuarios</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.tickets.length + '</div><div style="font-size:12px;color:var(--gray-400);">Chamados</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.catalog.categories.length + '</div><div style="font-size:12px;color:var(--gray-400);">Categorias</div></div>' +
        '<div style="background:var(--gray-50);padding:12px;border-radius:8px;text-align:center;">' +
        '<div style="font-size:24px;font-weight:700;color:var(--primary);">' + db.data.messages.length + '</div><div style="font-size:12px;color:var(--gray-400);">Mensagens</div></div>' +
        '</div></div></div>';
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
        addLog('fa-spinner fa-spin', '#6b7280', 'Verificando token...');
        var owner = await githubAPI.autoDetectUser(token);
        log.innerHTML = '';
        addLog('fa-check-circle', '#059669', 'Usuario detectado: <strong>' + owner + '</strong>');

        addLog('fa-spinner fa-spin', '#6b7280', 'Verificando repositorio rh-desk-data...');
        var repoResult = await githubAPI.ensureRepoExists(token, owner, 'rh-desk-data');
        if (repoResult.created) {
            addLog('fa-plus-circle', '#059669', 'Repositorio <strong>rh-desk-data</strong> criado!');
        } else {
            addLog('fa-check-circle', '#059669', 'Repositorio <strong>rh-desk-data</strong> encontrado!');
        }

        githubAPI.configure(token, owner, 'rh-desk-data');
        db.useGitHub = true;

        var config = { token: token, owner: owner, repo: 'rh-desk-data' };
        localStorage.setItem('rhdesk_github_config', JSON.stringify(config));
        localStorage.setItem('rhdesk_cloud_owner', owner);
        addLog('fa-save', '#059669', 'Configuracao salva!');

        addLog('fa-spinner fa-spin', '#6b7280', 'Enviando dados para o GitHub...');
        
        // Enviar dados atuais para o GitHub
        await githubAPI.saveFile('db/users.json', JSON.stringify(db.data.users, null, 2), 'Sync users');
        await githubAPI.saveFile('db/tickets.json', JSON.stringify(db.data.tickets, null, 2), 'Sync tickets');
        await githubAPI.saveFile('db/catalog.json', JSON.stringify(db.data.catalog, null, 2), 'Sync catalog');
        await githubAPI.saveFile('db/sla.json', JSON.stringify(db.data.sla, null, 2), 'Sync sla');
        await githubAPI.saveFile('db/messages.json', JSON.stringify(db.data.messages, null, 2), 'Sync messages');
        
        // Salvar owner no repo para outras maquinas descobrirem
        await githubAPI.saveFile('config.json', JSON.stringify({ owner: owner, repo: 'rh-desk-data', updatedAt: new Date().toISOString() }, null, 2), 'Save config');
        
        addLog('fa-cloud-upload-alt', '#059669', 'Dados enviados para a nuvem!');
        addLog('fa-check-double', '#059669', '<strong>Pronto! Usuarios podem fazer login de qualquer computador.</strong>');
        
        showToast('GitHub configurado com sucesso!', 'success');
        setTimeout(function() { renderAdminSettings(document.getElementById('content')); }, 2500);

    } catch (error) {
        addLog('fa-times-circle', '#dc2626', 'Erro: ' + error.message);
        showToast('Erro: ' + error.message, 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-magic"></i> Configurar Automaticamente';
}

async function syncNow() {
    showToast('Sincronizando...', 'info');
    try {
        await githubAPI.saveFile('db/users.json', JSON.stringify(db.data.users, null, 2), 'Sync users');
        await githubAPI.saveFile('db/tickets.json', JSON.stringify(db.data.tickets, null, 2), 'Sync tickets');
        await githubAPI.saveFile('db/catalog.json', JSON.stringify(db.data.catalog, null, 2), 'Sync catalog');
        await githubAPI.saveFile('db/sla.json', JSON.stringify(db.data.sla, null, 2), 'Sync sla');
        await githubAPI.saveFile('db/messages.json', JSON.stringify(db.data.messages, null, 2), 'Sync messages');
        db.lastSync = new Date().toISOString();
        showToast('Sincronizacao concluida!', 'success');
        renderAdminSettings(document.getElementById('content'));
    } catch (e) {
        showToast('Erro: ' + e.message, 'error');
    }
}

async function backupNow() {
    showToast('Criando backup...', 'info');
    await db.createBackup();
}

function disconnectGitHub() {
    if (!confirm('Deseja desconectar do GitHub?')) return;
    localStorage.removeItem('rhdesk_github_config');
    githubAPI.token = '';
    githubAPI.owner = '';
    githubAPI.repo = '';
    db.useGitHub = false;
    showToast('Desconectado', 'info');
    renderAdminSettings(document.getElementById('content'));
}
