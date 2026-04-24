// ============================================
// AUTH - Sistema de Autenticação
// ============================================

let currentUser = null;

function handleLogin(event) {
    event.preventDefault();

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    const user = db.getUserByEmail(email);

    if (!user) {
        showToast('E-mail não encontrado!', 'error');
        return false;
    }

    if (user.password !== password) {
        showToast('Senha incorreta!', 'error');
        return false;
    }

    currentUser = user;
    localStorage.setItem('rhdesk_currentUser', JSON.stringify(user));

    showMainApp();
    showToast(`Bem-vindo(a), ${user.name}!`, 'success');
    return false;
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('rhdesk_currentUser');
    showLoginScreen();
    showToast('Sessão encerrada', 'info');
}

function checkSession() {
    const saved = localStorage.getItem('rhdesk_currentUser');
    if (saved) {
        try {
            const user = JSON.parse(saved);
            const dbUser = db.getUserByEmail(user.email);
            if (dbUser) {
                currentUser = dbUser;
                return true;
            }
        } catch (e) {
            console.error('Erro ao restaurar sessão:', e);
        }
    }
    return false;
}

function getRoleName(role) {
    const roles = {
        admin: 'Administrador',
        analyst: 'Analista de RH',
        user: 'Usuário'
    };
    return roles[role] || role;
}

function isAdmin() { return currentUser && currentUser.role === 'admin'; }
function isAnalyst() { return currentUser && (currentUser.role === 'analyst' || currentUser.role === 'admin'); }
function isUser() { return currentUser && currentUser.role === 'user'; }
