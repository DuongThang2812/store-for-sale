import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../src/utils/shopHelpers.js';
import { validateNewPassword } from '../src/services/passwordPolicy.js';
import { createAuthService } from '../src/services/authService.js';

test('CSV exports neutralize spreadsheet formulas after whitespace and controls', () => {
    for (const value of ['=1+1', ' =1+1', '\t=1+1', '\r=1+1', '\n=1+1', '\tlabel', '＝1+1']) {
        assert.equal(csvCell(value), `"'${value.replaceAll('"', '""')}"`);
    }
    assert.equal(csvCell('Tên, "hàng"'), '"Tên, ""hàng"""');
    assert.equal(csvCell('Bánh quy'), '"Bánh quy"');
});

test('signup and password reset enforce the same byte-aware policy', async () => {
    assert.equal(validateNewPassword('abc12345'), 'abc12345');
    for (const password of ['short1', 'onlyletters', '12345678', 'a1'.repeat(37), 'á'.repeat(36) + 'a1']) {
        assert.throws(() => validateNewPassword(password), /Mật khẩu/);
    }
    let calls = 0;
    const service = createAuthService(() => ({ auth: {
        signUp: async () => { calls++; return { data: {}, error: null }; },
        updateUser: async () => { calls++; return { data: {}, error: null }; },
    } }));
    await assert.rejects(service.signUp({ email: 'a@example.com', password: 'weak', name: 'A' }), /Mật khẩu/);
    await assert.rejects(service.updatePassword('weak'), /Mật khẩu/);
    assert.equal(calls, 0);
});
