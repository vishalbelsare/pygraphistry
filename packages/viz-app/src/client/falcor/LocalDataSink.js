import { Observable } from 'rxjs/Observable';
import { PostMessageDataSink } from '@graphistry/falcor-socket-datasource';

export class LocalDataSink extends PostMessageDataSink {
    constructor(dataSource, ...args) {

        super(() => dataSource, ...args);

        dataSource.get([
            ['workbooks', 'length'],
            ['workbooks', 'open', ['id', 'title']],
            ['workbooks', 'open', 'views', 'length'],
            ['workbooks', 'open', 'views', 'current', ['id', 'title']]
        ])
        .mergeMap(
            (jsonGraphEnv) => Observable.merge(
                Observable.of({ source: parent }),
                Observable
                    .fromEvent(window, 'message')
                    .filter(({ data }) => data && data.type === 'ready')
            ),
            (jsonGraphEnv, { source }) => ({ source, jsonGraphEnv })
        )
        .subscribe(({ source, jsonGraphEnv }) => {
            console.log('viz-app sending init message');
            source.postMessage({
                type: 'init',
                cache: jsonGraphEnv,
                agent: 'graphistryjs',
                version: __VERSION__
            }, '*');
        });
    }
}
