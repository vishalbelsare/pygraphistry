import fs from 'fs';
import path from 'path';
import { deflate } from '@graphistry/node-pigz';
import { Observable, AsyncSubject } from 'rxjs';
import { createLogger } from '@graphistry/common/logger';

const logger = createLogger('viz-app:server:express:texture');

const imgPath = path.join(process.cwd(), './textures/test-colormap2.rgba');

const colorTexture = Observable.bindNodeCallback(fs.readFile)(imgPath)
    .do(raw => logger.trace('Loaded raw colorTexture', raw.length))
    .mergeMap(
        raw =>
            Observable.bindNodeCallback(deflate)(raw, {
                output: new Buffer(Math.max(1024, Math.round(raw.length * 1.5)))
            }),
        (raw, compressed) => ({ raw, compressed })
    )
    .do(() => logger.trace('Compressed color texture'))
    .do(({ raw }) => logger.trace('colorMap bytes', raw.length))
    .map(({ raw, compressed }) => ({
        width: 512,
        height: 512,
        bytes: raw.length,
        buffer: compressed[0]
    }))
    .take(1)
    .multicast(new AsyncSubject())
    .refCount();

function textureHandler(req, res) {
    logger.info({ req, res }, 'HTTP GET %s', req.originalUrl);
    colorTexture.subscribe({
        next(data) {
            res.set('Content-Encoding', 'gzip').send(data);
        },
        error(err) {
            logger.error(err, 'Error loading texture');
            res.status(502).send('Internal server error');
        }
    });
}

export { textureHandler, colorTexture };
export default textureHandler;

// VizServer.prototype.setupColorTexture = function () {
//     this.colorTexture = new Rx.ReplaySubject(1);
//     // const imgPath = path.resolve(__dirname, '../test-colormap2.rgba');
//     const imgPath = path.resolve('./test-colormap2.rgba');
//     // const imgPath = './test-colormap2.rgba';
//     Rx.Observable.bindNodeCallback(fs.readFile)(imgPath)
//         .flatMap((buffer) => {
//             logger.trace('Loaded raw colorTexture', buffer.length);
//             return Rx.Observable.bindNodeCallback(compress.deflate)(
//                 buffer,// binary,
//                 {output: new Buffer(
//                     Math.max(1024, Math.round(buffer.length * 1.5)))})
//                 .map((compressed) => ({
//                     raw: buffer,
//                     compressed: compressed
//                 }));
//         })
//         .do(() => { logger.trace('Compressed color texture'); })
//         .map((pair) => {
//             logger.trace('colorMap bytes', pair.raw.length);
//             return {
//                 buffer: pair.compressed[0],
//                 bytes: pair.raw.length,
//                 width: 512,
//                 height: 512
//             };
//         }).take(1)
//         .do((x) => this.colorTexture.next(x))
//         .subscribe(_.identity, log.makeRxErrorHandler(logger, 'img/texture'));
//     this.colorTexture
//         .do(() => { logger.trace('HAS COLOR TEXTURE'); })
//         .subscribe(_.identity, log.makeRxErrorHandler(logger, 'colorTexture'));
// };
