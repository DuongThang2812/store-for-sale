const MIN_LENGTH = 8;
const MAX_BYTES = 72;

export function validateNewPassword(password) {
    if (typeof password !== 'string' || password.length < MIN_LENGTH
        || new TextEncoder().encode(password).length > MAX_BYTES
        || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        throw new Error('Mật khẩu cần 8–72 byte, có chữ và số.');
    }
    return password;
}
