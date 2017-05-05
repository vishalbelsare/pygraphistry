import React from 'react';

import styles from './styles.less';
import { Observable } from 'rxjs/Observable';
import { Subscription } from 'rxjs/Subscription';
import { GraphistryJS } from '@graphistry/graphistry-client';

import logger from '../shared/logger.js';
const log = logger.createLogger(__filename);

export class GraphistryIframe extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.iFrame = undefined;
        this.apiSubscription = new Subscription();
        this.loadSubscription = new Subscription();
        this.iframeRefHandler = this.iframeRefHandler.bind(this);
    }

    iframeRefHandler (maybeIframe) {
        this.loadSubscription.unsubscribe();
        // iFrame is mounted
        if (this.iFrame = maybeIframe) {
            this.subscribeClientAPI(this.iFrame);
            this.loadSubscription = Observable
                .fromEvent(maybeIframe, 'load')
                .skip(1).subscribe(() => this.subscribeClientAPI(this.iFrame));
        }
    }

    componentWillUnmount() {
        this.apiSubscription.unsubscribe();
        this.loadSubscription.unsubscribe();
    }

    subscribeClientAPI(iFrame = this.iFrame) {
        this.apiSubscription.unsubscribe();
        if (iFrame) {
            const { layoutTweaks = [] } = this.props;
            this.apiSubscription = GraphistryJS(iFrame)
                .do((g) => g.encodeIcons('point', 'pointIcon'))
                .do((g) => layoutTweaks.forEach(([fn,...params]) => g[fn](...params)) )
                .subscribe(
                    () => undefined,
                    (e) => log.error(e));
        }
    }

    render () {
        const { src } = this.props;
        return <iframe
            ref={this.iframeRefHandler}
            allowFullScreen="true"
            scrolling="no"
            className={styles.iframe}
            src={src}
        />;
    }
}
