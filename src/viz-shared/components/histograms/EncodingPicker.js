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
    componentType: React.PropTypes.string.isRequired,
    name: React.PropTypes.string,
    sizeValue: React.PropTypes.Array,
    yAxisValue: React.PropTypes.string,
    showModal: React.PropTypes.bool,
    encodings: React.PropTypes.object,
    onYAxisChange: React.PropTypes.func,
    setEncoding: React.PropTypes.func,
    globalBinning: React.PropTypes.object,
    options: React.PropTypes.object.isRequired
};


function makeOptionLists(options) {

    const WIDTH = 50;
    return {
        point: {
            color: options.point.color.map((option) => ({
                value: option.variant,
                label:
                    <div style={{whiteSpace: 'nowrap', display: 'inline-block'}}>
                    <span className={styles['encoding-icon-container']} >{
                        option.legend.map((color, idx, all) => <span style={{
                            backgroundColor: color,
                            width: `${WIDTH / all.length}px`
                        }}/>)
                    }</span><label>{option.label}</label></div>,
            }))
        },
        edge: {
            color: options.edge.color.map((option) => ({
                value: option.variant,
                label:
                    <div style={{whiteSpace: 'nowrap', display: 'inline-block'}}>
                    <span className={styles['encoding-icon-container']} >{
                        option.legend.map((color, idx, all) => <span style={{
                            backgroundColor: color,
                            width: `${WIDTH / all.length}px`
                        }}/>)
                    }</span><label>{option.label}</label></div>,
            }))
        },
        sizeValue: [],
        yAxisValue: 'none'
    };


}





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

        this.options = makeOptionLists(props.options);

    }



    handleSelectColorChange (variation) {
        const reset = !variation;
        const id = this.props.componentType + 'Color';
        const encodingType = 'color';
        const binning = this.props.globalBinning;
        const graphType = this.props.componentType;
        const attribute = this.props.attribute;

        console.log('HANDLE SELECT COLOR',
            {variation, reset, id, encodingType, binning, graphType, attribute});

        if (this.props.setEncoding) {
            console.log('SET');
            this.props.setEncoding({
                variation, reset, id, encodingType, binning, graphType, attribute
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
        const id = this.props.componentType + 'Size';
        const encodingType = 'size';
        const binning = this.props.globalBinning;
        const graphType = this.props.componentType;
        const attribute = this.props.attribute;

        if (this.props.setEncoding) {
            this.props.setEncoding({
                id, encodingType, graphType, attribute, binning, reset
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

        const { options } = this;

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
                    <Modal.Title>Visualize <b>{this.props.componentType}:{this.props.attribute}</b></Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <h5>Show using color</h5>
                    <Select simpleValue
                        disabled={false}
                        value={
                            this.props.encodings
                                    && this.props.encodings[this.props.componentType]
                                    && this.props.encodings[this.props.componentType].color?
                                options[this.props.componentType].color
                                    .filter( ({value}) =>
                                            value === this.props.encodings[this.props.componentType].color.variation )[0]
                                : []
                        }
                        placeholder="Pick how to visualize"
                        options={ options[this.props.componentType].color }
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
                        resetValue={ options.yAxisValue }
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