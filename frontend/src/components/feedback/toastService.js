const listeners = new Set();

export function showToast(message, type = 'info', duration = 3500) {
    listeners.forEach((listener) => {
        try {
            listener({ message, type, duration, id: crypto.randomUUID() });
        } catch {
            // ignore subscriber errors
        }
    });
}

export const toast = {
    show: showToast,
    success: (msg, dur) => showToast(msg, 'success', dur),
    error: (msg, dur) => showToast(msg, 'error', dur),
    warning: (msg, dur) => showToast(msg, 'warning', dur),
    info: (msg, dur) => showToast(msg, 'info', dur)
};

export function subscribeToast(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
