import React from 'react';
import styles from './styles.less';
import classNames from 'classnames';

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
                <p>{type}:{attribute}</p>
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
