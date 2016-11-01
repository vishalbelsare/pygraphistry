// The majority of this code was copy+pasted from viz-app's `src/viz-worker/services/workbooks.js`.
// We should fix this code duplication, but we're under deadline, so easy trumps correct.
import url from 'url';
import path from 'path';
import bodyParser from 'body-parser';
import { simpleflake } from 'simpleflakes';
import encodeS3URI from 'node-s3-url-encode';
import { Observable } from 'rxjs';
import { s3, cache as Cache, logger as log } from '@graphistry/common';

const logger = log.createLogger('central:rest-api:workbook');


export function initWorkbookApi(app, config) {
    const s3WorkbookCache = new Cache(config.LOCAL_WORKBOOK_CACHE_DIR, config.LOCAL_WORKBOOK_CACHE);

    app.post('/workbook',
        bodyParser.json({ limit: '10MB' }),
        (req, res) => {
            logger.info({ req, res }, 'Workbook upload request received.');

            if(!req.body) {
                logger.error({req, res}, `No request body provided for workbook upload`);
                res.status(400).json({
                    success: false,
                    error: `No request body provided for workbook upload`
                });

                return;
            }

            const workbook = req.body;
            workbook.id = workbook.id || simpleflake.toJSON();

            return saveWorkbook({ workbook, config, s3WorkbookCache })
                .take(1)
                .subscribe(
                    () => {
                        const workbookUri = path.join('/workbook', workbook.id);
                        const workbookViewUri = (url.parse(`/graph/graph.html?workbook=${workbook.id}`)).path;

                        logger.info({req, res, workbook: workbook.id}, `Uploaded workbook saved to S3 and/or local disk cache`);
                        res.status(201)
                            .location(workbookUri)
                            .json({
                                success: true,
                                workbook: workbook.id,
                                view: workbookViewUri
                            });
                    },
                    (err) => {
                        logger.error({req, res, err}, `Error saving workbook`);
                        res.status(500).json({
                            success: false,
                            error: `Error saving workbook: ${err.message}`
                        })
                    }
                )
        }
    );
}


/**
 *  For a given workerbookId string, constructs a S3 bucket URI to save/load the workbook at.
 */
function makeWorkbookURL(workbookId) {
    return url.parse(encodeS3URI(path.join('Workbooks', workbookId, 'workbook.json')));
}


/**
 *  Saves a workbook object to both the local disk cache and S3 (if S3 is enabled)
 */
function saveWorkbook({ workbook, config, s3WorkbookCache }) {
    const serialized = JSON.stringify(workbook);
    const workbookURL = makeWorkbookURL(workbook.id);

    return Observable.from(
            s3WorkbookCache.put(workbookURL, serialized)
        ).catch((err) => {
            log.error({err}, 'Error saving workbook locally');
            return Observable.of(null)
        }).switchMap((localWorkbookPath) => {
            logger.info({workbook: workbook.id}, `Saved workbook to disk at path ${localWorkbookPath}`);
            logger.info({workbook: workbook.id}, `Uploading workbook to S3 in bucket "${config.BUCKET}" and name "${workbookURL.pathname}"`);
            return s3.upload(config.S3, config.BUCKET, {name: workbookURL.pathname},
                      new Buffer(serialized), {shouldCompress: true, ContentEncoding: 'gzip'})
        }).catch((err) => {
            logger.error({ err }, 'Error uploading workbook to s3.');
            return Observable.throw(e)
        });
}


// /**
//  *  Fetches a saved workbook, trying local disk cache first, then S3.
//  */
// function fetchWorkbook(workbookId, s3Cache, { S3, BUCKET }) {
//     const workbookURL = makeWorkbookURL(workbookId);
//     return Observable.defer(() => {
//         return Observable.from(s3Cache.get(workbookURL))
//             .do(() => logger.debug('Got workbook from cache'))
//             .catch((e) =>
//                 Observable.from(
//                     s3.download(S3, BUCKET, workbookURL.pathname, { expectCompressed: true })
//                 )
//                 .do(() => logger.debug('Got workbook from S3'))
//                 .mergeMap(
//                     (response) => s3Cache.put(workbookURL, response),
//                     (response, x) => response
//                 )
//             )
//             .map((response) => JSON.parse(response));
//     });
// }
