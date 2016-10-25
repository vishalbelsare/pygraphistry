import url from 'url';
import path from 'path';
import encodeS3URI from 'node-s3-url-encode';
import { s3, cache as Cache } from '@graphistry/common';
import { Observable, ReplaySubject } from 'rxjs';
import { migrateWorkbook,
         dataset as createDataset,
         workbook as createWorkbook } from 'viz-shared/models/workbooks';

export function loadWorkbooks(workbooksById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
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

export function loadWorkbook(workbooksById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
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

function downloadWorkbook(workbookId, s3Cache, { S3, BUCKET }) {
    const workbookURL = url.parse(encodeS3URI(path.join(
        'Workbooks', workbookId, 'workbook.json')));
    return Observable.defer(() => {
        return Observable
            .from(s3Cache.get(workbookURL))
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

export function saveWorkbookService(config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    return function saveWorkbook({ workbook }) {
        console.log('SAVING', workbook);

        return Observable.empty();
    }
}
