import express from 'express';
import { assert } from 'chai';
import moment from 'moment-timezone';

import { SplunkPivot } from '../../../src/shared/services/templates/SplunkPivot';
import { searchSplunk } from '../../../src/shared/services/templates/misc';


const date = moment.tz('06/10/2017', 'L', "America/Los_Angeles");
const dateJSON = date.toJSON();

const time = moment.tz('13:04:05', 'H:m:s', "America/Los_Angeles");
const timeJSON = time.toJSON();

const dateTimeUnix = moment.tz('06/10/2017 13:04:05', 'L H:m:s', "America/Los_Angeles").unix();
const fromDateTimeGuyanaUnix = moment.tz('06/10/2017 13:04:05', 'L H:m:s', "America/Guyana").unix();    
const fromDateUnix = moment.tz('06/10/2017 0:0:0', 'L H:m:s', "America/Los_Angeles").unix();
const toDateUnix = moment.tz('06/10/2017 23:59:59', 'L H:m:s', "America/Los_Angeles").unix();


describe('Splunk:dayRangeToSplunkParams', function () {

    let pivot;
    before(function () {
        pivot = new SplunkPivot({id: 'zz', name: 'zz'});
    })

    function compare (param, val) {
        assert.deepEqual(pivot.dayRangeToSplunkParams(param), val);
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
            { earliest_time: fromDateUnix });
    });

    it('from date & explicit time and default timezone', () => {
        compare(
            {from: { date: dateJSON, time: timeJSON } },
            { earliest_time: dateTimeUnix });
    });

    it('from date & explicit time and explicit timezone', () => {
        compare(
            {from: { date: dateJSON, time: timeJSON, timezone: 'America/Guyana' } },
            { earliest_time: fromDateTimeGuyanaUnix });
    });    

    it('to date and default time and default timezone', () => {
        compare(
            {to: { date: dateJSON } },
            {latest_time: toDateUnix });
    });

    it('to date & explicit time and default timezone', () => {
        compare(
            {to: { date: dateJSON, time: timeJSON } },
            {latest_time: dateTimeUnix });
    });

    it('to & from together', () => {
        compare(
            {from: { date: dateJSON }, to: { date: dateJSON } },
            {earliest_time: fromDateUnix, latest_time: toDateUnix });
    });

});     



describe('Splunk:toSplunk', function () {

    const cstr = `| rename _cd as EventID
                    | eval c_time=strftime(_time, "%Y-%d-%m %H:%M:%S")
                    | rename "c_time" as time | fields * | fields - _*`;

    it('simple', function () {
        assert.deepEqual(
            searchSplunk.toSplunk({fields: {}, query: 'index=*', time: {value: null}}),
            {
                searchQuery: `search index=* ${cstr} | head 1000`,
                searchParams: undefined
            })        
    });

    it('date override', function () {
        assert.deepEqual(
            searchSplunk.toSplunk({fields: {}, query: 'index=*', 
                time: {
                    value: {
                        from: { date: dateJSON, time: timeJSON },
                        to: { date: dateJSON, time: timeJSON }
                    } } }),
            {
                searchQuery: `search index=* ${cstr} | head 1000`,
                searchParams: { earliest_time: dateTimeUnix, latest_time: dateTimeUnix }
            });        
    });

});