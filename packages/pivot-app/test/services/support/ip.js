import { assert } from 'chai';
import { readFileSync } from 'fs';
import { EOL } from 'os';
import { resolve } from 'path';

import { isPrivateIP, isIP, isMac } from '../../../src/shared/services/support/ip';

describe('helpers', function() {
    describe('isPrivateIP', function() {
        it('matches 10.*', done => {
            assert.deepEqual(isPrivateIP('10.0.0.0'), true);
            done();
        });

        it('matches 172.16', done => {
            assert.deepEqual(isPrivateIP('172.16.0.0'), true);
            done();
        });

        it('matches 192.168.*', done => {
            assert.deepEqual(isPrivateIP('192.168.0.0'), true);
            done();
        });

        it('rejects non-local', done => {
            assert.deepEqual(isPrivateIP('100.0.0.0'), false);
            done();
        });

        it('rejects non-strings', done => {
            assert.deepEqual(isPrivateIP(1), false);
            done();
        });
    });

    describe('isIP', function() {
        it('matches 10.0.0.1', done => {
            assert.deepEqual(!!isIP('10.0.0.0'), true);
            done();
        });

        it('rejects 10.0.0', done => {
            assert.deepEqual(!!isIP('10.0.0'), false);
            done();
        });

        it('rejects non-strings', done => {
            assert.deepEqual(!!isIP(1), false);
            done();
        });
    });

    describe('isMac', function() {
        it('rejects null', done => {
            assert.deepEqual(isMac(), false);
            assert.deepEqual(isMac(null), false);
            assert.deepEqual(isMac(''), false);
            done();
        });

        it('rejects bad hex', done => {
            assert.deepEqual(isMac('11-11-11-11-11-1g'), false);
            done();
        });

        it('accepts 6-2', done => {
            assert.deepEqual(isMac('11-11-11-11-11-11'), true);
            assert.deepEqual(isMac('11-aa-11-bb-11-11'), true);
            done();
        });

        it('accepts 6:2', done => {
            assert.deepEqual(isMac('11:11:11:11:11:11'), true);
            assert.deepEqual(isMac('11:aa:11:bb:11:11'), true);
            done();
        });

        it('accepts 4.4', done => {
            assert.deepEqual(isMac('1111.1111.1111'), true);
            assert.deepEqual(isMac('11aa.11bb.1111'), true);
            done();
        });

        it('accepts invalid 6.2', done => {
            assert.deepEqual(isMac('11.11.11.11.11.11'), true);
            assert.deepEqual(isMac('11.aa.11.bb.11.11'), true);
            done();
        });
    });
});
