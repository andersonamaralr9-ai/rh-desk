// ============================================
// APP - Inicialização Principal
// ============================================

// Aguardar DOM carregar completamente
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 Iniciando RH Desk...');

    // Carregar configuração GitHub
    try {
        const ghConfig = localStorage.getItem('rhdesk_github_config');
        if (ghConfig) {
            const config = JSON.parse(ghConfig);
            if (config.token && config.owner && config.repo) {
                githubAPI.configure(config.token, config.owner, config.repo);
                console.log('✅ GitHub configurado');
            }
        }
    } catch (e) {
        console.error('Erro ao carregar config GitHub:', e);
    }

    // Inicializar banco de dados
    try {
        await db.init();
        console.log('✅ Database inicializado. Users:', db.data.users.length);
    } catch (e) {
        console.error('Erro ao inicializar DB:', e);
    }

    // Garantir que dados padrão existem
    if (!db.data.users || db.data.users.length === 0) {
        console.log('⚠️ Criando dados padrão...');
        db.createDefaultData();
        db.saveToLocal();
        console.log('✅ Dados padrão criados');
    }

    if (!db.data.sla || db.data.sla.length === 0) {
        db.createDefaultSLA();
        db.saveToLocal();
    }

    if (!db.data.catalog || !db.data.catalog.categories || db.data.catalog.categories.length === 0) {
        db.createDefaultCatalog();
        db.saveToLocal();
    }

    // Verificar sessão existente
    if (checkSession()) {
        showMainApp();
    } else {
        showLoginScreen();
    }

    // Auto-sync a cada 5 minutos
    setInterval(async () => {
        if (db.useGitHub && currentUser) {
            try {
                await db.syncFromGitHub();
                console.log('✅ Auto-sync concluído');
            } catch (e) {
                console.warn('⚠️ Auto-sync falhou:', e);
            }
        }
    }, 5 * 60 * 1000);

    // Processar fila de sync
    setInterval(() => {
        if (db.syncQueue.length > 0) {
            db.processSyncQueue();
        }
    }, 30 * 1000);

    console.log('🚀 RH Desk pronto!');
});
