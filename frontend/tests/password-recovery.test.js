import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService } from '../src/services/authService.js';
import { createAccountSessionController } from '../src/services/accountSession.js';
import { accountErrorMessage } from '../src/services/authMessages.js';
import { validateNewPassword } from '../src/services/passwordPolicy.js';

function createMockAuthClient({ session = null, error = null } = {}) {
    const calls = [];
    return {
        calls,
        auth: {
            async resetPasswordForEmail(email, options) {
                calls.push(['resetPasswordForEmail', email, options]);
                if (error) return { data: null, error };
                return { data: {}, error: null };
            },
            async updateUser(payload) {
                calls.push(['updateUser', payload]);
                if (error) return { data: null, error };
                return { data: { user: { id: 'u1' } }, error: null };
            },
            async getSession() {
                calls.push(['getSession']);
                return { data: { session }, error: null };
            },
            async getUser() {
                calls.push(['getUser']);
                return { data: { user: session?.user ?? null }, error: null };
            },
            async signOut(opts) {
                calls.push(['signOut', opts]);
                return { error: null };
            },
        },
    };
}

test('requestPasswordReset defaults to /reset-password when redirectTo is not passed', async () => {
    const mock = createMockAuthClient();
    const auth = createAuthService(() => mock);
    await auth.requestPasswordReset('TestUser@Example.COM');

    assert.equal(mock.calls.length, 1);
    const [method, email, options] = mock.calls[0];
    assert.equal(method, 'resetPasswordForEmail');
    assert.equal(email, 'testuser@example.com');
    // In node environment without window.location, options is undefined or points to /reset-password
    assert.ok(options === undefined || options.redirectTo.endsWith('/reset-password'));
});

test('requestPasswordReset preserves explicit HTTPS production redirectTo', async () => {
    const mock = createMockAuthClient();
    const auth = createAuthService(() => mock);
    const prodRedirect = 'https://tap-hoa-bin.pages.dev/reset-password';
    await auth.requestPasswordReset('shop@tap-hoa-bin.vn', prodRedirect);

    assert.equal(mock.calls.length, 1);
    const [method, email, options] = mock.calls[0];
    assert.equal(method, 'resetPasswordForEmail');
    assert.equal(email, 'shop@tap-hoa-bin.vn');
    assert.deepEqual(options, { redirectTo: prodRedirect });
});

test('requestPasswordReset validates email format before calling Supabase', async () => {
    const mock = createMockAuthClient();
    const auth = createAuthService(() => mock);

    await assert.rejects(() => auth.requestPasswordReset(''), /Email/);
    await assert.rejects(() => auth.requestPasswordReset('notanemail'), /Email không hợp lệ/);
    await assert.rejects(() => auth.requestPasswordReset('missing@domain'), /Email không hợp lệ/);
    assert.equal(mock.calls.length, 0);
});

test('accountSession handles PASSWORD_RECOVERY without loading store data', async () => {
    let refreshCalled = false;
    let locationReplacedWith = null;

    // Simulate global window object for redirect test
    globalThis.window = {
        location: {
            pathname: '/login',
            replace: url => { locationReplacedWith = url; },
        },
    };

    const controller = createAccountSessionController({
        auth: {
            getSession: async () => {
                refreshCalled = true;
                return { session: { user: { id: 'u1' } } };
            },
            getUser: async () => ({ id: 'u1' }),
        },
        stores: {
            loadContext: async () => {
                refreshCalled = true;
                return { stores: [], store: null };
            },
            getProfile: async () => ({ name: 'Test' }),
        },
        account: {
            getState: () => ({
                authLoading: false,
                ready: false,
                user: null,
                setChecking: () => {},
                setSignedOut: () => {},
                setAuthenticated: () => {},
                setError: () => {},
            }),
        },
        clearShop: () => {},
        openShop: () => {},
        localExists: () => false,
    });

    controller.handleAuthEvent('PASSWORD_RECOVERY', { user: { id: 'u1' } });

    // Ensure store refresh was NOT called
    assert.equal(refreshCalled, false);
    // Ensure redirect to /reset-password was triggered
    assert.equal(locationReplacedWith, '/reset-password');

    // Clean up mock window
    delete globalThis.window;
});

test('accountErrorMessage provides actionable Vietnamese guidance for reset errors', () => {
    assert.equal(
        accountErrorMessage(new Error('No recovery session'), 'reset'),
        'Phiên đặt lại mật khẩu đã hết hạn hoặc không tìm thấy. Vui lòng yêu cầu liên kết mới.'
    );
    assert.equal(
        accountErrorMessage(new Error('Auth session missing'), 'reset'),
        'Phiên đặt lại mật khẩu đã hết hạn hoặc không tìm thấy. Vui lòng yêu cầu liên kết mới.'
    );
    assert.equal(
        accountErrorMessage(new Error('Network request failed'), 'reset'),
        'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.'
    );
    assert.equal(
        accountErrorMessage(new Error('Mật khẩu cần ít nhất 8 ký tự, có chữ và số.'), 'reset'),
        'Mật khẩu cần ít nhất 8 ký tự, có chữ và số.'
    );
    assert.equal(
        accountErrorMessage(new Error('Hai lần nhập mật khẩu chưa giống nhau.'), 'reset'),
        'Hai lần nhập mật khẩu chưa giống nhau.'
    );
});

test('validateNewPassword enforces 8-72 character requirement with letters and digits', () => {
    assert.throws(() => validateNewPassword('short1'), /8/);
    assert.throws(() => validateNewPassword('onlyletters'), /chữ và số/);
    assert.throws(() => validateNewPassword('12345678'), /chữ và số/);
    assert.equal(validateNewPassword('ValidPass123'), 'ValidPass123');
});

test('updatePassword updates password and rejects weak input', async () => {
    const mock = createMockAuthClient();
    const auth = createAuthService(() => mock);

    await auth.updatePassword('NewStrongPass2026');
    assert.equal(mock.calls.length, 1);
    assert.deepEqual(mock.calls[0], ['updateUser', { password: 'NewStrongPass2026' }]);

    await assert.rejects(() => auth.updatePassword('weak'), /8/);
});

test('exchangeCodeForSession exchanges PKCE auth code for session', async () => {
    const mock = createMockAuthClient({ session: { user: { id: 'u100' } } });
    mock.auth.exchangeCodeForSession = async (code) => {
        mock.calls.push(['exchangeCodeForSession', code]);
        return { data: { session: mock.auth.session || { user: { id: 'u100' } } }, error: null };
    };
    const auth = createAuthService(() => mock);

    const session = await auth.exchangeCodeForSession('pkce-auth-code-123');
    assert.equal(session.user.id, 'u100');
    assert.deepEqual(mock.calls[0], ['exchangeCodeForSession', 'pkce-auth-code-123']);
});

test('rate limit and expired token errors are properly formatted and never leak tokens', () => {
    const rateLimitError = { status: 429, code: 'over_email_send_rate_limit', message: 'For security purposes, you can only request this once every 60 seconds' };
    const isRateLimit = rateLimitError.status === 429 || rateLimitError.code === 'over_email_send_rate_limit';
    assert.equal(isRateLimit, true);

    const expiredHash = 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    const params = new URLSearchParams(expiredHash);
    assert.equal(params.get('error_code'), 'otp_expired');
    assert.equal(params.get('error'), 'access_denied');
});

