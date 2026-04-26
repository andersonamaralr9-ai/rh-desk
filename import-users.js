// ============================================
// IMPORTAÇÃO DE USUÁRIOS EM MASSA
// ============================================

// Guardar referência da função original
var _originalRenderAdminUsers = typeof renderAdminUsers === 'function' ? renderAdminUsers : null;

// Sobrescrever renderAdminUsers para adicionar botões de importação
var _prevRenderAdminUsers = renderAdminUsers;
renderAdminUsers = function(container) {
    // Chamar a função original primeiro
    if (_prevRenderAdminUsers) {
        _prevRenderAdminUsers(container);
    }

    // Adicionar botões de importação ao header
    var header = container.querySelector('.page-header');
    if (header) {
        var existingBtns = header.querySelector('.header-actions') || header;
        var importBtns = document.createElement('div');
        importBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
        importBtns.innerHTML =
            '<button class="btn btn-success" onclick="downloadUserTemplate()">' +
            '<i class="fas fa-file-excel"></i> Baixar Layout</button>' +
            '<button class="btn btn-warning" onclick="openImportModal()">' +
            '<i class="fas fa-file-import"></i> Importar Usuarios</button>' +
            (header.querySelector('.btn') ? '' : '<button class="btn btn-primary" onclick="showUserModal()"><i class="fas fa-plus"></i> Novo Usuario</button>');

        // Verificar se já existe botão de novo usuário e reorganizar
        var oldBtn = header.querySelector('.btn-primary');
        if (oldBtn) {
            var wrapper = document.createElement('div');
            wrapper.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
            wrapper.appendChild(importBtns.querySelector('.btn-success').cloneNode(true));
            wrapper.appendChild(importBtns.querySelector('.btn-warning').cloneNode(true));
            wrapper.appendChild(oldBtn);
            header.appendChild(wrapper);
        } else {
            header.appendChild(importBtns);
        }
    }
};

// === DOWNLOAD DO TEMPLATE CSV ===
function downloadUserTemplate() {
    var header = 'nome;email;senha;perfil';
    var example1 = 'Maria Silva;maria.silva@empresa.com;senha123;usuario';
    var example2 = 'Joao Santos;joao.santos@empresa.com;senha456;analista';
    var example3 = 'Ana Oliveira;ana.oliveira@empresa.com;senha789;admin';
    var instructions = [
        '',
        '# INSTRUCOES DE PREENCHIMENTO',
        '# -----------------------------------------',
        '# Separador: ponto e virgula (;)',
        '# Codificacao: UTF-8',
        '# ',
        '# CAMPOS:',
        '# nome    - Nome completo do usuario (obrigatorio)',
        '# email   - E-mail unico do usuario (obrigatorio)',
        '# senha   - Senha inicial de acesso (obrigatorio)',
        '# perfil  - Tipo: admin / analista / usuario (obrigatorio)',
        '# ',
        '# PERFIS DISPONIVEIS:',
        '# admin    = Administrador (acesso total)',
        '# analista = Analista de RH (atende chamados)',
        '# usuario  = Usuario comum (abre chamados)',
        '# ',
        '# IMPORTANTE:',
        '# - A primeira linha (cabecalho) e obrigatoria',
        '# - Remova estas linhas de instrucao antes de importar',
        '# - Nao use virgula como separador, use ponto e virgula',
        '# - E-mails duplicados serao ignorados na importacao'
    ];

    var csv = header + '\n' + example1 + '\n' + example2 + '\n' + example3 + '\n' + instructions.join('\n');

    var BOM = '\uFEFF';
    var blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'layout_importacao_usuarios.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Layout baixado! Preencha e importe.', 'success');
}

// === MODAL DE IMPORTAÇÃO ===
function openImportModal() {
    var bodyHtml =
        '<div style="margin-bottom:20px;">' +
        '<div style="background:#eff6ff;border:1px solid #3b82f6;border-radius:8px;padding:14px;margin-bottom:16px;font-size:13px;color:#1e40af;">' +
        '<i class="fas fa-info-circle"></i> <strong>Formato aceito:</strong> CSV com separador <strong>ponto e virgula (;)</strong><br>' +
        'Colunas: <code>nome;email;senha;perfil</code><br>' +
        'Perfis validos: <code>admin</code>, <code>analista</code>, <code>usuario</code><br><br>' +
        '<a href="javascript:void(0)" onclick="downloadUserTemplate()" style="color:#2563eb;font-weight:600;">' +
        '<i class="fas fa-download"></i> Baixar layout de exemplo</a></div>' +
        '<div class="form-group">' +
        '<label><i class="fas fa-file-csv"></i> Selecione o arquivo CSV</label>' +
        '<input type="file" id="import-file" accept=".csv,.txt" style="width:100%;padding:10px;border:1.5px solid var(--gray-300);border-radius:var(--radius);">' +
        '</div>' +
        '<div id="import-preview" style="display:none;margin-top:16px;">' +
        '<h4 style="margin-bottom:12px;font-size:15px;"><i class="fas fa-eye"></i> Pre-visualizacao</h4>' +
        '<div id="import-preview-content"></div>' +
        '</div>' +
        '<div id="import-result" style="display:none;margin-top:16px;"></div>' +
        '</div>';

    var footerHtml =
        '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>' +
        '<button class="btn btn-primary" id="btn-do-import" onclick="executeImport()" disabled>' +
        '<i class="fas fa-upload"></i> Importar</button>';

    openModal('Importar Usuarios', bodyHtml, footerHtml);

    // Listener para arquivo
    setTimeout(function() {
        var fileInput = document.getElementById('import-file');
        if (fileInput) {
            fileInput.addEventListener('change', function() {
                previewImportFile(this);
            });
        }
    }, 100);
}

// === PREVIEW DO ARQUIVO ===
var importData = [];

function previewImportFile(input) {
    var file = input.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(e) {
        var text = e.target.result;
        var lines = text.split(/\r?\n/).filter(function(line) {
            return line.trim() !== '' && !line.trim().startsWith('#');
        });

        if (lines.length < 2) {
            showToast('Arquivo vazio ou sem dados alem do cabecalho', 'error');
            return;
        }

        // Detectar separador
        var separator = ';';
        var headerLine = lines[0].toLowerCase().trim();
        if (headerLine.indexOf(';') === -1 && headerLine.indexOf(',') >= 0) {
            separator = ',';
        }

        var headers = lines[0].split(separator).map(function(h) { return h.trim().toLowerCase(); });

        // Validar colunas obrigatórias
        var requiredCols = ['nome', 'email', 'senha', 'perfil'];
        var missingCols = requiredCols.filter(function(col) { return headers.indexOf(col) === -1; });

        if (missingCols.length > 0) {
            document.getElementById('import-preview').style.display = 'block';
            document.getElementById('import-preview-content').innerHTML =
                '<div style="background:#fee2e2;color:#dc2626;padding:12px;border-radius:8px;">' +
                '<i class="fas fa-times-circle"></i> Colunas faltando: <strong>' + missingCols.join(', ') + '</strong>' +
                '<br>Colunas encontradas: ' + headers.join(', ') +
                '<br>Separador detectado: "' + separator + '"</div>';
            return;
        }

        var nameIdx = headers.indexOf('nome');
        var emailIdx = headers.indexOf('email');
        var passIdx = headers.indexOf('senha');
        var roleIdx = headers.indexOf('perfil');

        importData = [];
        var errors = [];
        var existingEmails = db.data.users.map(function(u) { return u.email.toLowerCase(); });

        for (var i = 1; i < lines.length; i++) {
            var cols = lines[i].split(separator).map(function(c) { return c.trim(); });
            if (cols.length < 4) {
                errors.push({ line: i + 1, msg: 'Colunas insuficientes' });
                continue;
            }

            var name = cols[nameIdx];
            var email = cols[emailIdx];
            var password = cols[passIdx];
            var roleRaw = cols[roleIdx].toLowerCase();

            // Validações
            if (!name || !email || !password || !roleRaw) {
                errors.push({ line: i + 1, msg: 'Campos vazios' });
                continue;
            }

            if (email.indexOf('@') === -1) {
                errors.push({ line: i + 1, msg: 'E-mail invalido: ' + email });
                continue;
            }

            if (existingEmails.indexOf(email.toLowerCase()) >= 0) {
                errors.push({ line: i + 1, msg: 'E-mail ja existe: ' + email });
                continue;
            }

            // Verificar duplicata dentro do próprio arquivo
            var alreadyInImport = importData.some(function(u) { return u.email.toLowerCase() === email.toLowerCase(); });
            if (alreadyInImport) {
                errors.push({ line: i + 1, msg: 'E-mail duplicado no arquivo: ' + email });
                continue;
            }

            // Mapear perfil
            var role = 'user';
            if (roleRaw === 'admin' || roleRaw === 'administrador') role = 'admin';
            else if (roleRaw === 'analista' || roleRaw === 'analyst') role = 'analyst';
            else if (roleRaw === 'usuario' || roleRaw === 'user') role = 'user';

            importData.push({
                name: name,
                email: email,
                password: password,
                role: role
            });
        }

        // Mostrar preview
        var previewDiv = document.getElementById('import-preview');
        var contentDiv = document.getElementById('import-preview-content');
        previewDiv.style.display = 'block';

        var html = '';
        if (errors.length > 0) {
            html += '<div style="background:#fef3c7;color:#92400e;padding:10px;border-radius:8px;margin-bottom:12px;font-size:13px;">' +
                '<i class="fas fa-exclamation-triangle"></i> <strong>' + errors.length + ' linha(s) com problema:</strong><ul style="margin:8px 0 0 16px;">';
            errors.forEach(function(err) {
                html += '<li>Linha ' + err.line + ': ' + err.msg + '</li>';
            });
            html += '</ul></div>';
        }

        if (importData.length > 0) {
            html += '<div style="background:#ecfdf5;color:#059669;padding:10px;border-radius:8px;margin-bottom:12px;font-size:14px;">' +
                '<i class="fas fa-check-circle"></i> <strong>' + importData.length + ' usuario(s) prontos para importar</strong></div>';

            html += '<div style="max-height:250px;overflow-y:auto;"><table style="width:100%;font-size:13px;">' +
                '<thead><tr><th>Nome</th><th>E-mail</th><th>Perfil</th></tr></thead><tbody>';
            importData.forEach(function(u) {
                html += '<tr><td>' + escapeHtml(u.name) + '</td><td>' + escapeHtml(u.email) + '</td>' +
                    '<td><span class="role-badge" style="background:var(--primary);color:white;font-size:11px;">' +
                    getRoleName(u.role) + '</span></td></tr>';
            });
            html += '</tbody></table></div>';

            document.getElementById('btn-do-import').disabled = false;
        } else {
            html += '<div style="background:#fee2e2;color:#dc2626;padding:10px;border-radius:8px;">' +
                '<i class="fas fa-times-circle"></i> Nenhum usuario valido para importar</div>';
            document.getElementById('btn-do-import').disabled = true;
        }

        contentDiv.innerHTML = html;
    };

    reader.readAsText(file, 'UTF-8');
}

// === EXECUTAR IMPORTAÇÃO ===
async function executeImport() {
    if (importData.length === 0) {
        showToast('Nenhum usuario para importar', 'error');
        return;
    }

    var btn = document.getElementById('btn-do-import');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Importando...';

    var resultDiv = document.getElementById('import-result');
    resultDiv.style.display = 'block';
    resultDiv.innerHTML = '<div style="color:var(--gray-500);"><i class="fas fa-spinner fa-spin"></i> Importando ' + importData.length + ' usuario(s)...</div>';

    var imported = 0;
    var failed = 0;

    for (var i = 0; i < importData.length; i++) {
        try {
            await db.addUser({
                name: importData[i].name,
                email: importData[i].email,
                password: importData[i].password,
                role: importData[i].role
            });
            imported++;
        } catch(e) {
            console.error('Erro ao importar ' + importData[i].email + ':', e);
            failed++;
        }
    }

    // Forçar sync com GitHub
    if (db.useGitHub) {
        try {
            await githubAPI.saveFile('db/users.json', JSON.stringify(db.data.users, null, 2), 'Import ' + imported + ' users');
        } catch(e) {
            console.error('Erro sync GitHub:', e);
        }
    }

    var resultHtml = '';
    if (imported > 0) {
        resultHtml += '<div style="background:#ecfdf5;color:#059669;padding:12px;border-radius:8px;margin-bottom:8px;">' +
            '<i class="fas fa-check-circle"></i> <strong>' + imported + ' usuario(s) importado(s) com sucesso!</strong></div>';
    }
    if (failed > 0) {
        resultHtml += '<div style="background:#fee2e2;color:#dc2626;padding:12px;border-radius:8px;">' +
            '<i class="fas fa-times-circle"></i> ' + failed + ' usuario(s) falharam</div>';
    }

    resultDiv.innerHTML = resultHtml;
    btn.innerHTML = '<i class="fas fa-check"></i> Concluido';

    showToast(imported + ' usuario(s) importado(s)!', 'success');

    // Recarregar tela de usuarios após 2 segundos
    setTimeout(function() {
        closeModal();
        importData = [];
        navigateTo('admin-users');
    }, 2000);
}
