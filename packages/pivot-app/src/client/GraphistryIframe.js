import React from 'react';

import styles from './styles.less';
import { Subscription } from 'rxjs/Subscription';
import { GraphistryJS } from '@graphistry/client-api';

import logger from '../shared/logger.js';
const log = logger.createLogger(__filename);

export class GraphistryIframe extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.iFrame = undefined;
        this.apiSubscription = new Subscription();
        this.iframeRefHandler = this.iframeRefHandler.bind(this);
    }

    iframeRefHandler (maybeIframe) {
        this.iFrame = maybeIframe;
        // iFrame is mounted
        if (maybeIframe) {
            this.subscribeClientAPI(this.iFrame);
        }
    }

    componentWillUnmount() {
        this.apiSubscription.unsubscribe();
    }

    subscribeClientAPI(iFrame = this.iFrame) {
        this.apiSubscription.unsubscribe();
        if (iFrame) {
            this.apiSubscription = GraphistryJS(iFrame)
                .do((g) => g.encodeIcons('point', 'pointIcon'))
                .do((g) => (this.props.layoutTweaks || []).forEach(([fn,...params]) => g[fn](...params)) )
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
