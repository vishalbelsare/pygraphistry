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
    const localCache = new Cache(config.LOCAL_WORKBOOK_CACHE_DIR, config.LOCAL_WORKBOOK_CACHE);

    app.post('/workbook',
        bodyParser.json({ limit: '10MB' }),
        (req, res) => uploadWorkbookRequestHandler(req, res, localCache, config)
    );

    app.get('/workbook/:workbook',
        (req, res) => downloadWorkbookRequestHandler(req, res, localCache, config)
    );
}


/**
 *  For a given workerbookId string, constructs a S3 bucket URI to save/load the workbook at.
 */
function makeWorkbookURL(workbookId) {
    return url.parse(encodeS3URI(path.join('Workbooks', workbookId, 'workbook.json')));
}


function uploadWorkbookRequestHandler(req, res, localCache, config) {
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
    workbook.id = workbook.id || simpleflake().toJSON();

    return saveWorkbook({ workbook, config, localCache })
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
                });
            }
        );
}


/**
 *  Saves a workbook object to both the local disk cache and S3 (if S3 is enabled)
 */
function saveWorkbook({ workbook, config, localCache }) {
    const serialized = JSON.stringify(workbook);
    const workbookURL = makeWorkbookURL(workbook.id);

    return Observable.from(localCache.put(workbookURL, serialized))
        .catch( (err) => {
            log.error({err}, 'Error saving workbook locally');
            return Observable.of(null);
        })
        .switchMap( (localWorkbookPath) => {
            logger.info({workbook: workbook.id}, `Saved workbook to disk at path ${localWorkbookPath}`);
            logger.info({workbook: workbook.id}, `Uploading workbook to S3 in bucket "${config.BUCKET}" and name "${workbookURL.pathname}"`);

            return s3.upload(
                config.S3,
                config.BUCKET,
                {name: workbookURL.pathname},
                new Buffer(serialized),
                {shouldCompress: true, ContentEncoding: 'gzip'}
            );
        })
        .catch( (err) => {
            logger.error({ err }, 'Error uploading workbook to s3.');
            return Observable.throw(err);
        });
}




function downloadWorkbookRequestHandler(req, res, localCache, config) {
    logger.info({req, res}, `Workbook download request received`);

    if(!req.params.workbook) {
        logger.warn({req, res}, `Error: workbook download request did not specify a workbook ID to download`);

        res.status(404).json({
            success: false,
            error: `No workbook ID specified to download`
        });

        return;
    }

    const workbookId = req.params.workbook;
    const S3 = config.S3;
    const BUCKET = config.BUCKET;

    return fetchWorkbook({workbookId, localCache, S3, BUCKET})
        .subscribe(
            (workbook) => {
                logger.info({req, res, workbook: workbookId}, `Fetched workbook successfully. Responding to download request with its contents.`);
                res.status(200).json(workbook);
            },
            (err) => {
                logger.warn({req, res, err, workbook: workbookId}, `Error fetching requested workbook for download request. Sending 404 to client.`);
                res.status(404).json({
                    success: false,
                    error: `Workbook with ID "${workbookId}" could not be found, or there was an error retrieving it.`
                });
            }
        );
}


/**
 *  Fetches a saved workbook, trying local disk cache first, then S3.
 */
function fetchWorkbook({workbookId, localCache, S3, BUCKET }) {
    const workbookURL = makeWorkbookURL(workbookId);

    return Observable.from(localCache.get(workbookURL))
        .do(() => logger.debug({workbook: workbookId}, `Workbook found in local storage cache. Will fetch local copy and skip S3.`))
        .map((workbookFileBuffer) => workbookFileBuffer.toString())
        .catch( (err) => {
            logger.debug({err, workbook: workbookId}, `Could not fetch workbook from local storage cache. Will try to fetch from S3 bucket ${BUCKET}.`);

            // Download workbook from S3, and cache it locally
            return Observable
                .from(s3.download(S3, BUCKET, workbookURL.pathname, {expectCompressed: true}))
                .mergeMap((s3WorkbookContent) => {
                    logger.debug({workbook: workbookId}, `Fetched workbook from S3. Will cache workbook locally for future use.`);

                    // Flat map the 's3 download complete' item to an Observable that merges that
                    // item with an Observable which saves the workbook to local cache (ignoring
                    // errrors and emitted items from the latter).
                    return Observable.from(localCache.put(workbookURL, s3WorkbookContent))
                        .catch((cacheErr) => {
                            logger.warn({err: cacheErr, workbook: workbookId}, `Error trying to cache workbook from S3 locally.`);
                            return Observable.empty();
                        })
                        .ignoreElements()
                        .merge(Observable.of(s3WorkbookContent));
                });
        })
        .map((s3WorkbookContent) => JSON.parse(s3WorkbookContent));
}
