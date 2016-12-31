import React from 'react';
import styles from './styles.less';

export class GraphistryIframe extends React.Component {
    constructor(props, context) {
        super(props, context);
    }

    render () {
        const { src } = this.props;
        return <iframe
            allowFullScreen="true"
            scrolling="no"
            className={styles.iframe}
            src={src}
        />;
    }
}