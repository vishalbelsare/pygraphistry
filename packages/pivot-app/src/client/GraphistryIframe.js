import React from 'react';

import styles from './styles.less';
import GraphistryJS from '@graphistry/graphistry-client';

export class GraphistryIframe extends React.Component {
    constructor(props, context) {
        super(props, context);
        this.iframeRefHandler = this.iframeRefHandler.bind(this);
    }

    iframeRefHandler (maybeIframe) {        
        if (maybeIframe) {
            //mounted
            const iframe = maybeIframe;
            GraphistryJS(iframe)
                .do((g) => g.encodeIcons('point', 'pointIcon'))
                .subscribe(() => undefined, console.error.bind(console, 'graphistry-client', 'error'));
        } else {
            //unmounted
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