function copyText(text: string) {
    // 优先使用 preload 暴露的 Electron clipboard（contextIsolation 下 navigator.clipboard 不可用）
    const clip = (window as any).electronAPI?.clipboard;
    if (clip) {
        try {
            clip.writeText(text);
            return true;
        } catch {
            return false;
        }
    }
    // Web 环境 fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    document.body.appendChild(textarea);
    textarea.select();
    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        document.body.removeChild(textarea);
    }
}

export async function copy(text: string) {
    // 优先使用 preload 暴露的 Electron clipboard
    const clip = (window as any).electronAPI?.clipboard;
    if (clip) {
        try {
            clip.writeText(text);
            return true;
        } catch {
            return false;
        }
    }
    // Web 环境
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return copyText(text);
    }
}
