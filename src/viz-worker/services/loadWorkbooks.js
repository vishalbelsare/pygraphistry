import url from 'url';
import path from 'path';
import encodeS3URI from 'node-s3-url-encode';
import { s3, cache as Cache } from '@graphistry/common';
import { Observable, ReplaySubject } from '@graphistry/rxjs';
import { migrateWorkbook, assignCurrentDataset } from '../../viz-shared/models/legacy';
import { dataset as createDataset,
         workbook as createWorkbook } from '../../viz-shared/models';

export function loadWorkbooks(workbooksById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    const loadWorkbookById = loadWorkbook(workbooksById, config, s3Cache);
    return function loadWorkbooksById({ workbookIds, server, options = {}}) {
        return Observable
            .from(workbookIds)
            .mergeMap(
                (workbookId) => loadWorkbookById({ workbookId, server, options }),
                (workbookId, workbook) => ({ workbook })
            );
        }
}

export function loadWorkbook(workbooksById, config, s3Cache = new Cache(config.LOCAL_CACHE_DIR, config.LOCAL_CACHE)) {
    return function loadWorkbookById({ workbookId, server, options = {} }) {
        return (workbookId in workbooksById) ?
            workbooksById[workbookId] : (
            workbooksById[workbookId] = Observable
                .from(downloadWorkbook(workbookId, s3Cache, config))
                .map((workbook) => migrateWorkbook(workbook))
                .map((workbook) => assignCurrentDataset(workbook, options))
                .catch(() => Observable
                    .of(createWorkbook(createDataset(options), workbookId)))
                // TODO: refactor everything in server-viz so we can delete this line
                .do((workbook) => server && server.workbookDoc.next(workbook))
                .concat(Observable.never())
                .multicast(new ReplaySubject(1))
                .refCount()
                .take(1)
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
