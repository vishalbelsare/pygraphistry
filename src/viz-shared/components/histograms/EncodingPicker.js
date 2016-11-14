import React from 'react';
import Select from 'react-select';
import RcSwitch from 'rc-switch';
import { Modal, Button, OverlayTrigger, Tooltip, Popover } from 'react-bootstrap';
import classNames from 'classnames';
import _ from 'underscore';

import globalStyles from 'viz-shared/index.less';
import styles from 'viz-shared/components/histograms/styles.less';


const propTypes = {
    id: React.PropTypes.string.isRequired,
    attribute: React.PropTypes.string.isRequired,
    type: React.PropTypes.string.isRequired,
    name: React.PropTypes.string,
    sizeValue: React.PropTypes.Array,
    yAxisValue: React.PropTypes.string,
    showModal: React.PropTypes.bool,
    onYAxisChange: React.PropTypes.func,
    setEncoding: React.PropTypes.func,
    resetEncoding: React.PropTypes.func,
    globalBinning: React.PropTypes.object,
    encodings: React.PropTypes.object.isRequired
};


const WIDTH = 50;
const defaultProps = {
    options: [
        {value: "color-categorical",
        label:
            <div style={{whiteSpace: 'nowrap', display: 'inline-block'}}>
            <span className={styles['encoding-icon-container']} >{
                [
                    "rgb(166, 206, 227)", "rgb(31, 120, 180)", "rgb(178, 223, 138)", "rgb(51, 160, 44)", "rgb(251, 154, 153)", "rgb(227, 26, 28)", "rgb(253, 191, 111)", "rgb(255, 127, 0)", "rgb(202, 178, 214)", "rgb(106, 61, 154)", "rgb(255, 255, 153)", "rgb(177, 89, 40)"
                ].map((color, idx, all) => <span style={{
                    backgroundColor: color,
                    width: `${WIDTH / all.length}px`
                }}/>)
            }</span><label>Categorical</label></div>,
        group: "color"},
        {value: "color-continuous",
        label:
            <div style={{whiteSpace: 'nowrap', display: 'inline-block'}}>
            <span className={styles['encoding-icon-container']} >{
                _.range(0, 10).map((i, idx, all) => <span style={{
                    backgroundColor: `rgb(${Math.round(i * 255 / all.length)},${Math.round(i * 255 / all.length)},255)`,
                    width: `${WIDTH / all.length}px`
                }}/>)
            }</span><label>Gradient</label></div>,
        group: "color"},
        {value: "size", label: "size", group: "size"},
    ],
    sizeValue: [],
    yAxisValue: 'none'
};

// {<value> -> {value, label}}
const namedOptions = _.object(
        _.pluck(defaultProps.options, 'value'),
        defaultProps.options);

export default class EncodingPicker extends React.Component {

    constructor(props) {
        super(props);
        this.handleSelectSizeChange = this.handleSelectSizeChange.bind(this);
        this.handleSelectColorChange = this.handleSelectColorChange.bind(this);
        this.handleSelectYAxisChange = this.handleSelectYAxisChange.bind(this);
        this.close = this.close.bind(this);
        this.open = this.open.bind(this);

        this.state = {
            showModal: false
        };

    }



    handleSelectColorChange (colorValue) {
        const variation = (colorValue === 'color-categorical') ? 'categorical' : 'quantitative';
        const reset = colorValue === null;
        const id = this.props.type + 'Color';
        const encodingType = 'color';
        const binning = this.props.globalBinning;
        const graphType = this.props.type;
        const attribute = this.props.attribute;

        console.log('HANDLE SELECT COLOR',
            {colorValue, variation, reset, id, encodingType, binning, graphType, attribute});


        if (reset && this.props.resetEncoding) {
            console.log('RESET');
            this.props.resetEncoding({
                id, encodingType, graphType, attribute
            });
        } else if (this.props.setEncoding) {
            console.log('SET');
            this.props.setEncoding({
                variation, id, encodingType, graphType, attribute, binning
            });
        }

    }

    handleSelectYAxisChange (yAxisValue) {
        if (this.props.onYAxisChange) {
            this.props.onYAxisChange(yAxisValue || 'none');
        }
    }


    handleSelectSizeChange (newEnabled) {

        // No variation for sizes :/
        const reset = !newEnabled;
        const id = this.props.type + 'Size';
        const encodingType = 'size';
        const binning = this.props.globalBinning;
        const graphType = this.props.type;
        const attribute = this.props.attribute;

        if (reset && this.props.resetEncoding) {
            this.props.resetEncoding({
                id, encodingType, graphType, attribute
            });
        }

        if (this.props.setEncoding) {
            this.props.setEncoding({
                id, encodingType, graphType, attribute, binning
            });
        }

    }

    close() {
        this.setState({showModal: false});
    }

    open() {
        this.setState({showModal: true});
    }


    render(){

        return (<div id={this.props.id} name={this.props.name || this.props.id} style={{display: 'inline-block'}}>

            <OverlayTrigger placement='top'
                trigger={['hover']} // <-- do this so react bootstrap doesn't complain about accessibility
                style={{zIndex: 999999999}}
                overlay={ <Tooltip id={`${this.props.id}_tooltip`}>Pick fields</Tooltip> }>
                <Button href='javascript:void(0)'
                    className={classNames({
                        [globalStyles['fa']]: true,
                        [globalStyles['fa-cog']]: true,
                        [styles['encoding-picker-button']]: true
                    })}
                    onClick={this.open} />
            </OverlayTrigger>

            <Modal show={this.state.showModal} onHide={this.close} style={{zIndex: 999999999}}>
                <Modal.Header closeButton>
                    <Modal.Title>Visualize <b>{this.props.type}:{this.props.attribute}</b></Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <h5>Show using color</h5>
                    <Select simpleValue
                        disabled={false}
                        value={
                            this.props.encodings ?
                                [ this.props.encodings.options[this.props.type].color ]
                                : []
                        }
                        placeholder="Pick how to visualize"
                        options={
                            _.filter(defaultProps.options, (o) => o.group === 'color')
                        }
                        id={`${this.props.id}_select`}
                        name={`${this.props.name || this.props.id}_select`}
                        optionRenderer={({value, label}) => label}
                        onChange={this.handleSelectColorChange} />
                    <h5>Show using size</h5>
                    <RcSwitch
                        checked={ this.props.sizeValue.length > 0 }
                        checkedChildren={'On'}
                        unCheckedChildren={'Off'}
                        onChange={ this.handleSelectSizeChange }/>
                    <h5>Histogram Y-Axis Scaling</h5>
                    <Select simpleValue
                        disabled={false}
                        value={ this.props.yAxisValue}
                        resetValue={ defaultProps.yAxisValue }
                        placeholder="Pick transform"
                        options={
                            [{value: 'none', label: 'none'},
                             {value: 'log', label: 'log'}]
                        }
                        id={`${this.props.id}_yaxis`}
                        onChange={this.handleSelectYAxisChange} />
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={this.close}>Close</Button>
                </Modal.Footer>
            </Modal>
        </div>);
    }
}

EncodingPicker.propTypes = propTypes
EncodingPicker.defaultProps = defaultProps;
