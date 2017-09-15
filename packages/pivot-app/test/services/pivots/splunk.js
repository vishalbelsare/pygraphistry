import express from 'express';
import { assert } from 'chai';
import moment from 'moment-timezone';

import { SplunkPivot } from '../../../src/shared/services/templates/splunk/splunkPivot';
import { searchSplunk } from '../../../src/shared/services/templates/splunk/search';
import { 
    colTypes, typeColors, typeSizes, typeIcons,
    typesToSizes, typesToIcons } from '../../../src/shared/services/templates/splunk/settings';
import { colorShorthands, typeColorsAliases } from '../../../src/shared/services/templates/splunk/colors';

const timezoneV = "America/Los_Angeles";
const timezoneGuyanaV = "America/Guyana";
const timeV = "13:04:05";
const dateV = "06/10/2017"
const dateTimeV = `${dateV} ${timeV}`;

const date = moment.utc(dateV, 'L');
const dateJSON = date.toJSON();

const time = moment.utc(timeV, 'H:m:s');
const timeJSON = time.toJSON();

const dateTimeUnix = moment.tz(dateTimeV, 'L H:m:s', timezoneV).unix();
const fromDateTimeGuyanaUnix = moment.tz(dateTimeV, 'L H:m:s', timezoneGuyanaV).unix();    
const fromDateUnix = moment.tz('06/10/2017 0:0:0', 'L H:m:s', "America/Los_Angeles").unix();
const toDateUnix = moment.tz('06/10/2017 23:59:59', 'L H:m:s', "America/Los_Angeles").unix();


const dateTimeStr = moment(dateTimeUnix * 1000).format();
const fromDateTimeGuyanaStr = moment(fromDateTimeGuyanaUnix * 1000).format();
const fromDateStr = moment(fromDateUnix * 1000).format();
const toDateStr = moment(toDateUnix * 1000).format();


require('./splunk/expandHelper.js');
require('./splunk/expand.js');

describe('Splunk:dayRangeToSplunkParams', function () {

    let pivot;
    before(function () {
        pivot = new SplunkPivot({id: 'zz', name: 'zz'});
    })

    function compare (param, val) {
        assert.deepEqual(pivot.dayRangeToSplunkParams(param), val);
    }

    function compareGlobal (param, globalParam, val) {
        assert.deepEqual(pivot.dayRangeToSplunkParams(param, globalParam), val);
    }

    it('undefined', () => {
        compare(undefined, undefined);
        compare({from: null, to: null}, undefined);
        compare({from: undefined, to: undefined}, undefined);
        compare({from: {}, to: {}}, undefined);
        compare({from: {time: 'zz'}, to: {time: 'zz'}}, undefined);
    });

    it('from date and default time and default timezone', () => {
        compare(
            {from: { date: dateJSON } },
            { earliest_time: fromDateStr });
    });

    it('from date & explicit time and default timezone', () => {
        compare(
            {from: { date: dateJSON, time: timeJSON } },
            { earliest_time: dateTimeStr });
    });

    it('from date & explicit time and explicit timezone', () => {
        compare(
            {from: { date: dateJSON, time: timeJSON, timezone: 'America/Guyana' } },
            { earliest_time: fromDateTimeGuyanaStr });
    });    

    it('to date and default time and default timezone', () => {
        compare(
            {to: { date: dateJSON } },
            {latest_time: toDateStr });
    });

    it('to date & explicit time and default timezone', () => {
        compare(
            {to: { date: dateJSON, time: timeJSON } },
            {latest_time: dateTimeStr });
    });

    it('to & from together', () => {
        compare(
            {from: { date: dateJSON }, to: { date: dateJSON } },
            {earliest_time: fromDateStr, latest_time: toDateStr });
    });

    it('global to & from', () => {
        compareGlobal(
            undefined,
            {from: { date: dateJSON }, to: { date: dateJSON } },
            {earliest_time: fromDateStr, latest_time: toDateStr });
    });

    it('global to with local override', () => {
        compareGlobal(
            {from:  { date: dateJSON, time: timeJSON, timezone: 'America/Los_Angeles' }, 
             to:    { date: dateJSON, time: timeJSON, timezone: 'America/Los_Angeles' } },
            {from: { date: 1, time: 1, timezone: 1}, to: { date: 1, time: 1, timezone: 1}},
            {earliest_time: dateTimeStr, latest_time: dateTimeStr });
    });

});     


describe('Splunk:toSplunk', function () {

    const cstr = `| rename _cd as EventID
                    | eval c_time=strftime(_time, "%Y-%d-%m %H:%M:%S")
                    | rename "c_time" as time | fields * | fields - _*`;

    it('simple', function () {
        //only test don't crash; too brittle to test output string match
        searchSplunk.toSplunk({fields: {}, query: 'index=*', time: {value: null}});
    });

    it('date override', function () {
        //only test don't crash; too brittle to test output string match
        searchSplunk.toSplunk({fields: {}, query: 'index=*', 
            time: {
                value: {
                    from: { date: dateJSON, time: timeJSON },
                    to: { date: dateJSON, time: timeJSON }
                } } });
    });

});

describe('Splunk:Encodings', function () {

    it('combines types', function () {
        assert.deepEqual(colTypes['dmac'], 'mac');
    });

    it('combines colors', function () {
        assert.deepEqual(
            typeColors['dmac'], 
            colorShorthands[typeColorsAliases['mac']]);
    });

    it('combines sizes', function () {
        assert.deepEqual(
            typeSizes['dmac'],
            typesToSizes['mac']);
    });

    it('combines icons', function () {
        assert.deepEqual(
            typeIcons['dmac'],
            typesToIcons['mac']);
    });

});