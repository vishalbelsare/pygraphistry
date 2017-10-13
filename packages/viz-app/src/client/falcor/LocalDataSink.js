import { Observable } from 'rxjs/Observable';
import { PostMessageDataSink } from '@graphistry/falcor-socket-datasource';

export class LocalDataSink extends PostMessageDataSink {
    constructor(getDataSource, ...args) {
        super(getDataSource, ...args);
        console.log(`Graphistry client: ready for API connection`);
        Observable.fromEvent(window, 'message')
            .filter(({ data }) => data && data.type === 'ready')
            .filter(({ data }) => data.agent === 'graphistryjs')
            .mergeMapTo(
                getDataSource().get([
                    ['workbooks', 'open', 'id'],
                    ['workbooks', 'open', 'views', 'current', 'id']
                ]),
                ({ source }, cache) => ({ source, cache })
            )
            .startWith({ source: parent }) // say hello first
            .subscribe(({ source, cache }) => {
                source &&
                    source.postMessage &&
                    source.postMessage(
                        {
                            cache,
                            type: 'init',
                            agent: 'graphistryjs',
                            version: __VERSION__
                        },
                        '*'
                    );
            });
    }
}
