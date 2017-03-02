import url from 'url';
import path from 'path';
import encodeS3URI from 'node-s3-url-encode';
import { s3, cache as Cache, logger as commonLogger } from '@graphistry/common';
import { Observable, ReplaySubject } from 'rxjs';
import { migrateWorkbook,
         dataset as createDataset,
         serializeWorkbook,
         workbook as createWorkbook } from 'viz-app/models/workbooks';

const log = commonLogger.createLogger('viz-worker:services:workbooks');

export function loadWorkbooks(workbooksById, config, s3Cache) {
    const loadWorkbookById = loadWorkbook(workbooksById, config, s3Cache);
    return function loadWorkbooksById({ workbookIds, options = {}}) {
        return Observable
            .from(workbookIds)
            .mergeMap(
                (workbookId) => loadWorkbookById({ workbookId, options }),
                (workbookId, workbook) => ({ workbook })
            );
        }
}

function loadWorkbook(workbooksById, config, s3Cache) {
    return function loadWorkbookById({ workbookId, options = {} }) {
        if (workbookId in workbooksById) {
            return workbooksById[workbookId];
        }

        const $workbook = Observable
                .from(downloadWorkbook(workbookId, s3Cache, config))
                .catch(e => {
                    log.debug(e, 'Could not load specified workbook, continuing with fresh workbook');
                    return Observable.of(createWorkbook(createDataset(options), workbookId));
                })
                .map((workbook) => migrateWorkbook(workbook, options))
                .catch((e) => {
                    log.error(e, 'Could not migrate saved workbook, continuing with fresh workbook');
                    return Observable.of(createWorkbook(createDataset(options), workbookId));
                })
                .take(1)
                .multicast(new ReplaySubject(1))
                .refCount();

        return workbooksById[workbookId] = $workbook;
    }
}


function makeWorkbookURL(workbookId) {
    return url.parse(encodeS3URI(path.join('Workbooks', workbookId, 'workbook.json')));
}

function downloadWorkbook(workbookId, s3Cache, { S3, BUCKET }) {
    const workbookURL = makeWorkbookURL(workbookId);
    return Observable.defer(() => {
        return Observable.from(s3Cache.get(workbookURL))
            .do(() => log.debug('Got workbook from cache'))
            .catch((e) =>
                Observable.from(
                    s3.download(S3, BUCKET, workbookURL.pathname, { expectCompressed: true })
                )
                .do(() => log.debug('Got workbook from S3'))
                .mergeMap(
                    (response) => s3Cache.put(workbookURL, response),
                    (response, x) => response
                )
            )
            .map((response) => JSON.parse(response));
    });
}

export function saveWorkbookService(config, s3Cache) {
    return function saveWorkbook({ workbook }) {
        const serialized = JSON.stringify(serializeWorkbook(workbook));
        const workbookURL = makeWorkbookURL(workbook.id);

        return Observable.from(
                s3Cache.put(workbookURL, serialized)
            ).catch((e) => {
                log.error(e, 'Error saving workbook locally');
                return Observable.of(null)
            }).switchMap(() =>
                s3.upload(config.S3, config.BUCKET, {name: workbookURL.pathname},
                          new Buffer(serialized), {shouldCompress: true, ContentEncoding: 'gzip'})
            ).catch((e) => {
                log.error(e, 'Error uploading workbook to s3');
                return Observable.throw(e)
            });
    }
}
