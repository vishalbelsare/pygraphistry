import * as fs from 'fs';
import * as moment from 'moment';
import * as shm from 'shm-typed-array';
import { VectorGraph } from '../vgraph';
import { Observable, Scheduler } from 'rxjs';
import { isColorColumn, isDateTimeColumn } from '../types';
import defaultConverters, { colors, datetimes } from '../types';
import { createFormatter } from 'fast-csv/lib/formatter/formatter';

// Suppress moment deprecation warnings
(moment as any).suppressDeprecationWarnings = true;

const csvRow = createFormatter({ quoteColumns: true, quoteHeaders: false });

const {
    UInt32AttributeVector,
    DoubleAttributeVector,
    StringAttributeVector,
    Int32AttributeVector,
    Int64AttributeVector,
    FloatAttributeVector,
    BoolAttributeVector,
} = VectorGraph;

const workerId = process.argv[2];
const rows = fs.createWriteStream('', { fd: 4 });
// console.log(`${workerId}: starting worker`);
const msgs = Observable.fromEvent(process, 'message');
const exit = msgs.filter(({ type }) => type === 'exit');
const work = msgs.filter(({ type }) => type === 'data').takeUntil(exit);

exit.take(1).subscribe(() => process.exit(0));
work.map(({ key }) => {
        const buf = shm.get(+key, 'Uint8Array');
        const vgraph = VectorGraph.decode(buf);
        shm.detach(buf.key, false);
        return vgraph;
    })
    .take(1)
    .do(() => process.send({ type: 'decoded' }))
    .map((vgraph) => [
        ...vgraph.bool_vectors.map(shapeVector(converterFor('bool'))),
        ...vgraph.float_vectors.map(shapeVector(converterFor('float'))),
        ...vgraph.int32_vectors.map(shapeVector(converterFor('int32'))),
        ...vgraph.int64_vectors.map(shapeVector(converterFor('int64'))),
        ...vgraph.double_vectors.map(shapeVector(converterFor('double'))),
        ...vgraph.string_vectors.map(shapeVector(converterFor('string'))),
        ...vgraph.uint32_vectors.map(shapeVector(converterFor('uint32'))),
    ])
    .map((columns) => ({
        index: 0, columns,
        total: Math.max(0, ...columns.map(({ values }) => values.length)) - 1,
    }))
    .expand(({ columns, index, total }) => {
        const row = () => csvRow(toArr()) + '\n';
        const toArr = columns.reduce.bind(columns,
            function reduceRow(xs, { values, converter }, idx) {
                xs[idx] = converter(values[index]);
                return xs;
            }, []
        );
        for (; index < total; ++index) {
            if (!rows.write(row())) {
                return Observable.fromEvent(rows, 'drain', () => ({
                    columns, index: index + 1, total
                })).take(1)
            }
        }
        if (index === total) {
            return Observable.bindNodeCallback(rows.write, () => ({
                columns, index: index + 1, total
            })).bind(rows)(row());
        }
        return Observable.empty();
    })
    .takeLast(1)
    .flatMap(({ index }) => Observable
        .bindNodeCallback(process.send)
        .bind(process)({ type: 'done', rows: index }))
    .ignoreElements()
    .subscribe({
        error(err) {
            console.error(`${workerId}: ${(err && err.stack || err) + '\n'}`);
            process.exit(1);
        },
        complete() { process.exit(0); }
    });

function identity(x) { return x; };
function longToString(int64: Long) { return int64.toString(); };

function shapeVector(getConverter: (vector) => (value: any, format?: string) => any) {
    return function (vector) {
        return { ...vector, converter: getConverter(vector) };
    }
}

function converterFor(vectorType: string) {
    return function getConverter(vector) {
        let converter;
        let { name, values, type = vectorType, format = '' } = vector;
        if (isColorColumn(name, type) && colors[vectorType]) {
            converter = colors[vectorType](format);
        } else if (isDateTimeColumn(name, type) && datetimes[vectorType]) {
            converter = datetimes[vectorType](format);
        } else {
            converter = defaultConverters[vectorType];
        }
        return converter;
    }
}
