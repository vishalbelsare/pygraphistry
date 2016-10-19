import React from 'react';
import { Button } from 'react-bootstrap';
import classNames from 'classnames';
import styles from 'viz-shared/components/histograms/styles.less';
import stylesGlobal from 'viz-shared/index.less';

export class Sparkline extends React.Component {
    constructor(props, context) {
        super(props, context);
        this._assignD3ContainerRef = (d3Container) => {
            this.d3Container = d3Container;
        };
    }
    render() {
        /*
        let { type, attribute } = this.props;
        return (
            <div className={styles['histogram']}>
                <p>{type}:{attribute}</p>
                <div ref={this._assignD3ContainerRef}/>
            </div>
        );
        */
        let { global: _global = {},
              masked: _masked = {},
              type, attribute } = this.props;

        _global = JSON.stringify(_global, null, 1);
        _masked = JSON.stringify(_masked, null, 1);

        return (
            <div className={styles['histogram']}>

                <div className={styles['histogram-title']}>
                    <Button href='javascript:void(0)'
                        className={classNames({
                            [stylesGlobal['fa']]: true,
                            [stylesGlobal['fa-times']]: true,
                            [styles['histogram-close']]: true
                        })} />
                    <span>{type}:{attribute}</span>
                </div>

                <pre style={{ float: `left`, width: `50%` }}>
                    global: {_global}
                </pre>
                <pre style={{ float: `right`, width: `50%` }}>
                    masked: {_masked}
                </pre>
                <div ref={this._assignD3ContainerRef}/>
            </div>
        );
    }
    renderSparkline(d3Container) {
        if (!d3Container) {
            return;
        }
        // do d3 stuff here
    }
    componentDidMount() {
        this.renderSparkline(this.d3Container);
    }
    componentDidUpdate() {
        this.renderSparkline(this.d3Container);
    }
    componentWillUnmount() {
        this.d3Container = undefined;
        this._assignD3ContainerRef = undefined;
    }
}
