import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, displayCalculation, enterCalculatorKey } from '../src/utils/calculator.js';

test('basic calculations respect multiplication and division before addition and subtraction', () => {
    for (const [expression, expected] of [['25+15', '40'], ['25-40', '-15'], ['12*3', '36'], ['100/4', '25'], ['2+3*4', '14'], ['20-6/3', '18'], ['8/2*3', '12'], ['-5*3+20', '5']]) assert.equal(calculate(expression), expected);
});
test('decimal calculations display without floating point noise', () => {
    assert.equal(calculate('0.1+0.2'), '0.3');
    assert.equal(calculate('1/3'), '0.333333333333333');
    assert.equal(displayCalculation('12000.5*2'), '12.000,5 × 2');
});
test('invalid expressions and division by zero are rejected', () => {
    for (const expression of ['2/0', '5+', '', 'alert(1)', '2**3', '9'.repeat(20)]) assert.throws(() => calculate(expression));
});
test('key entry replaces operators, handles decimal input and starts fresh after a result', () => {
    assert.equal(enterCalculatorKey('12+', '*'), '12*');
    assert.equal(enterCalculatorKey('12+', '.'), '12+0.');
    assert.equal(enterCalculatorKey('12.3', '.'), '12.3');
    assert.equal(enterCalculatorKey('0', '5'), '5');
    assert.equal(enterCalculatorKey('40', '5', true), '5');
    assert.equal(enterCalculatorKey('40', '+', true), '40+');
    assert.equal(enterCalculatorKey('123', 'backspace'), '12');
    assert.equal(enterCalculatorKey('123', 'clear'), '');
});
