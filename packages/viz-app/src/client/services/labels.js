import { loadResource } from './resource';
import { Observable, ReplaySubject } from 'rxjs';
import { ref as $ref, atom as $atom } from '@graphistry/falcor-json-graph';

/** Arbitrary limit to prevent large range requests, ~ 260kb. */
const LABEL_SIZE_LIMIT = Math.pow(2, 18);

export function loadLabels(loadViewsById, labelsByIndex = {}, labelOffsetsByType = {}) {
  const loadLabelByIndexAndType = loadLabel(labelsByIndex);
  const loadOffsetBufferByType = loadOffsetBuffer(labelOffsetsByType);

  return function loadLabelsByIndexAndType({
    workbookIds,
    viewIds,
    labelTypes,
    labelIndexes,
    options = {}
  }) {
    return loadViewsById({
      workbookIds,
      viewIds,
      options
    })
      .mergeMap(
        ({ workbook, view }) => labelTypes,
        ({ workbook, view }, labelType) => ({
          workbook,
          view,
          labelType
        })
      )
      .mergeMap(
        ({ workbook, view, labelType }) => loadOffsetBufferByType(labelType, options),
        ({ workbook, view, labelType }, offsets) => ({
          workbook,
          view,
          labelType,
          offsets
        })
      )
      .mergeMap(
        ({ workbook, view, labelType, offsets }) => labelIndexes,
        ({ workbook, view, labelType, offsets }, labelIndex) => ({
          workbook,
          view,
          labelType,
          offsets,
          labelIndex
        })
      )
      .mergeMap(
        ({ workbook, view, labelType, offsets, labelIndex }) =>
          loadLabelByIndexAndType({
            offsets,
            labelType,
            labelIndex
          }),
        ({ workbook, view, labelType, offsets, labelIndex }, label) => ({
          workbook,
          view,
          label
        })
      );
  };
}

function loadLabel(labelTypesByIndex) {
  return function loadLabelByIndexAndType({ offsets, labelType, labelIndex }) {
    const labelsByType = labelTypesByIndex[labelIndex] || (labelTypesByIndex[labelIndex] = {});
    return labelType in labelsByType
      ? labelsByType[labelType]
      : (labelsByType[labelType] = Observable.defer(() => {
          const lowerBound = offsets[labelIndex];
          const upperBound = labelIndex < offsets.length ? offsets[labelIndex + 1] - 1 : undefined; // Upper bound will be undefined for last label

          if (upperBound !== undefined && lowerBound >= upperBound) {
            throw new Error('Invalid byte range indicated at', labelType, labelIndex);
          }

          const byteEnd =
            upperBound !== undefined && upperBound.toString ? upperBound.toString(10) : '';
          const byteStart =
            lowerBound !== undefined && lowerBound.toString ? lowerBound.toString(10) : '';

          // First label: start can be 0, but end must be set.
          // Last label: start is set, end unspecified, okay.
          if (!byteStart && !byteEnd) {
            throw new Error(
              'Undefined labels range request',
              labelType,
              labelIndex,
              byteStart,
              byteEnd
            );
          } else if (upperBound && upperBound - lowerBound > LABEL_SIZE_LIMIT) {
            throw new Error(
              'Too large labels range request',
              labelType,
              labelIndex,
              byteStart,
              byteEnd
            );
          }

          return loadResource(`${labelType}Labels.buffer`, {
            responseType: 'text', // 'json' does not work for a range request!
            headers: { Range: `bytes=${byteStart}-${byteEnd}` }
          });
        })
          .map(({ status, request, response }) => {
            if (status !== 206) {
              throw new Error(`HTTP error acquiring ranged data at: ${request.url}`);
            }
            return JSON.parse(response);
          })
          .map(row => {
            // Dynamically transform deprecated/obsolete label response format of {attribute: value, ...}
            if (row.hasOwnProperty('columns')) {
              return row;
            }

            return {
              type: labelType,
              index: labelIndex,
              data: {
                formatted: false,
                title: decodeURIComponent(row._title),
                columns: Object.keys(row).reduce((columns, key) => {
                  if (key !== '_title') {
                    columns.push({ key, value: row[key] });
                  }
                  return columns;
                }, [])
              }
            };
          })
          .finally(() => {
            delete labelsByType[labelType];

            const labelIndexHasPendingRequests = Object.keys(labelsByType).length > 0;

            if (labelIndexHasPendingRequests === false) {
              delete labelTypesByIndex[labelIndex];
            }
          })
          .multicast(() => new ReplaySubject(1))
          .refCount()
          .take(1));
  };
}

function loadOffsetBuffer(labelOffsetsByType) {
  return function loadOffsetBufferByType(labelType, { contentKey = '' }) {
    return labelType in labelOffsetsByType
      ? labelOffsetsByType[labelType]
      : (labelOffsetsByType[labelType] = loadResource(`${labelType}Labels.offsets`, {
          contentKey,
          responseType: 'arraybuffer'
        })
          .map(({ response }) => new Uint32Array(response))
          .multicast(new ReplaySubject(1))
          .refCount()
          .take(1));
  };
}
