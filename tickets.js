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
            <span class