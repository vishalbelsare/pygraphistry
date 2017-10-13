import Color from 'color';
import _ from 'underscore';
import moment from 'moment';
import { Observable, Scheduler } from 'rxjs';
import { accessorForTargetType } from './VGraphLoader';
import { dateToUTCGenerator } from './dateToUTCGenerator';

// Suppress moment deprecation warnings
moment.suppressDeprecationWarnings = true;

const log = require('@graphistry/common').logger;
const logger = log.createLogger('graph-viz', 'graph-viz/js/libs/VGraphLoader.js');

/**
 * Infer column types when possible. If vector type is datetime,
 * asynchronously loop and normalize all time values to ints via moment.
 *
 * @param  vec               Decoded column vector
 * @param  attributeMetadata Honestly I don't really know
 *
 * @return Observable<{ name: string, type: T, values: T[], target: VectorGraph.AttributeTarget }>
 */
function interpolateVectorType(vec, attributeMetadata, updateClient) {
    const { name, values } = vec,
        sampleValue = values[0];
    let obs = Observable.of(values),
        type = typeof sampleValue;

    // Check if name is `color`
    if (/color/i.test(name)) {
        if (type === 'number') {
            if (sampleValue > 0 && sampleValue <= 0xffffffff) {
                type = 'color';
            }
        } else if (type === 'string') {
            try {
                const c = new Color(sampleValue);
                type = (c && typeof c.rgbaString() === 'string' && 'color') || type;
            } catch (e) {}
        }
        if (type !== 'color') {
            logger.debug('Failed to cast ' + name + ' as a color.');
        }
    } else if (/time/i.test(name) || /date/i.test(name)) {
        // Check if name contains `time` or `date`
        logger.debug('Attempting to cast ' + name + ' to a moment object.');
        const testMoment = castToMoment(sampleValue);
        if (!testMoment.isValid()) {
            logger.debug('Failed to cast ' + name + ' as a moment.');
        } else {
            type = 'date';
            logger.debug('Successfully cast ' + name + ' as a moment.');
            logger.debug('Casting all ' + name + ' values as moments.');
            // Invalidate attributeMetadata aggregations that are value-based:
            if (
                attributeMetadata &&
                typeof attributeMetadata === 'object' &&
                typeof attributeMetadata.aggregations === 'object'
            ) {
                // See also ColumnAggregation's AggAliases and AggTypes:
                attributeMetadata.aggregations = _.omit(attributeMetadata.aggregations, [
                    'min',
                    'minValue',
                    'max',
                    'maxValue',
                    'avg',
                    'averageValue',
                    'sum',
                    'std',
                    'standardDeviation',
                    'stddev',
                    'stdev',
                    'var',
                    'variance'
                ]);
            }

            obs = listToItemRanges(values, 50000)
                .concatMap(valuesSlice =>
                    updateClient().mergeMapTo(
                        valuesSlice
                            .map(dateToUTCGenerator(sampleValue))
                            .subscribeOn(Scheduler.async, 10)
                    )
                )
                .toArray();
        }
    }
    return obs.map(values => ({ ...vec, type, values }));
}

/**
 * @param {VectorGraph} vg
 * @returns Observable<AttrObject[]>
 */
export function getAttributes0(vg, metadata, updateClient) {
    return Observable.from(getVectors0(vg))
        .filter(({ values }) => values.length > 0)
        .let(updateClient)
        .concatMap(vec => interpolateVectorType(vec, null, updateClient))
        .toArray();
}

/**
 * @param {VectorGraph} vg
 * @param {DataframeMetadata} metadata
 * @returns Observable<{nodes: Object<AttrObject>, edges: Object<AttrObject>}>
 */
export function getAttributes1(vg, metadata = {}, updateClient) {
    return Observable.from(getVectors1(vg))
        .filter(({ values }) => values.length > 0)
        .let(updateClient)
        .map(vec => {
            const { name, target } = vec;
            const typeAccessor = accessorForTargetType[target];
            const typeMetadata =
                (metadata &&
                    metadata[typeAccessor] &&
                    _.find(metadata[typeAccessor], ({ attributes }) =>
                        attributes.hasOwnProperty(name)
                    )) ||
                undefined;
            return [vec, (typeMetadata && typeMetadata.attributes[name]) || undefined];
        })
        .concatMap(([vec, meta]) => interpolateVectorType(vec, meta, updateClient))
        .reduce(
            (memo, vec) => {
                const attrs = memo[accessorForTargetType[vec.target]];
                attrs[vec.name] = vec;
                return memo;
            },
            { nodes: {}, edges: {} }
        );
}

function listToItemRanges(list, itemsPerRange) {
    return Observable.from({
        length: Math.ceil(list.length / itemsPerRange)
    }).map((x, rangeIndex) => {
        const rangeStart = rangeIndex * itemsPerRange;
        const rangeCount = Math.min(itemsPerRange, list.length - rangeStart);
        return Observable.range(rangeStart, rangeCount).map(itemIndex => list[itemIndex]);
    });
}

function getVectors0(vg) {
    return vg.string_vectors.concat(vg.uint32_vectors, vg.int32_vectors, vg.double_vectors);
}

/**
 * @param {VectorGraph} vg
 * @returns {any[]}
 */
function getVectors1(vg) {
    return _.flatten(
        [
            vg.uint32_vectors,
            vg.int32_vectors,
            vg.int64_vectors,
            vg.float_vectors,
            vg.double_vectors,
            vg.string_vectors,
            vg.bool_vectors
        ],
        false
    );
}

function castToMoment(value) {
    let momentVal;
    if (typeof value === 'number') {
        // First attempt unix seconds constructor
        momentVal = moment.unix(value);

        // If not valid, or unreasonable year, try milliseconds constructor
        if (!momentVal.isValid() || momentVal.year() > 5000 || momentVal.year() < 500) {
            momentVal = moment(value);
        }
    } else {
        momentVal = moment(value);
    }

    return momentVal;
}
