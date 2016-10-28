import url from 'url';
import path from 'path';
import encodeS3URI from 'node-s3-url-encode';
import { s3, cache as Cache, logger as commonLogger } from '@graphistry/common';
import { Observable, ReplaySubject } from 'rxjs';
import { migrateWorkbook,
         dataset as createDataset,
         serializeWorkbook,
         workbook as createWorkbook } from 'viz-shared/models/workbooks';

const log = commonLogger.createLogger("viz-worker:services:workbook");

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
        return (workbookId in workbooksById) ?
            workbooksById[workbookId] : (
            workbooksById[workbookId] = Observable
                .from(downloadWorkbook(workbookId, s3Cache, config))
                .map((workbook) => migrateWorkbook(workbook, options))
                .catch(() => Observable
                    .of(createWorkbook(createDataset(options), workbookId)))
                .take(1)
                .multicast(new ReplaySubject(1))
                .refCount()
            );
    }
}


function makeWorkbookURL(workbookId) {
    return url.parse(encodeS3URI(path.join('Workbooks', workbookId, 'workbook.json')));
}

function downloadWorkbook(workbookId, s3Cache, { S3, BUCKET }) {
    const workbookURL = makeWorkbookURL(workbookId);
    return Observable.defer(() => {
        return Observable
            .from(s3Cache.get(workbookURL))
        .do((something) => log.info("we have gotten something from the cache", new String(something)))
            .catch((e) => Observable.from(s3
                .download(S3, BUCKET, workbookURL, { expectCompressed: true }))
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
        console.log('SAVING', serialized);
        return Observable.from(
                s3Cache.put(workbookURL, serialized)
            ).catch((e) => {
                log.error(e, "Workbook did not save locally")
                return Observable.of(null)
            }).switchMap(() =>
                s3.upload(config.S3, config.BUCKET, {name: workbookURL.pathname}, new Buffer(serialized), {shouldCompress: true, ContentEncoding: 'gzip'})
            ).catch((e) => {
                log.error(e, "Workbook did not upload to s3")
                return Observable.throw(e)
            });
    }
}
