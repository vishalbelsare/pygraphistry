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
            color: options.point.color.map(({name, variant, colors, label}) => ({
                value: name,
                label:
                    <div style={{whiteSpace: 'nowrap', display: 'inline-block'}}>
                    <span className={styles['encoding-icon-container']} >{
                        colors.map((color, idx, all) => <span style={{
                            backgroundColor: color,
                            width: `${WIDTH / all.length}px`
                        }}/>)
                    }</span><label>{label}</label></div>,
            }))
        },
        edge: {
            color: options.edge.color.map(({name, variant, colors, label}) => ({
                value: name,
                label:
                    <div style={{whiteSpace: 'nowrap', display: 'inline-block'}}>
                    <span className={styles['encoding-icon-container']} >{
                        colors.map((color, idx, all) => <span style={{
                            backgroundColor: color,
                            width: `${WIDTH / all.length}px`
                        }}/>)
                    }</span><label>{label}</label></div>,
            }))
        },
        sizeValue: [],
        yAxisValue: 'none'
    };


}


export function isEncoded(encodings, column, encodingType) {
    return encodings
        && encodings[column.componentType]
        && encodings[column.componentType][encodingType]
        && encodings[column.componentType][encodingType].attribute === column.attribute;
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



    handleSelectColorChange (name) {

        if (!this.props.setEncoding) return;

        const encodingType = 'color';
        const graphType = this.props.componentType;
        const attribute = this.props.attribute;

        if (!name) {

            return this.props.setEncoding({
                reset: true, name, encodingType, graphType, attribute
            });

        } else {

            const {variant: variation, colors, label} =
                this.props.options[this.props.componentType].color
                    .filter( ({name: optName}) => name === optName )[0];

            this.props.setEncoding({
                reset: false, variation, name, encodingType, colors, graphType, attribute
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
                            isEncoded(this.props.encodings, this.props, 'color')
                                ? options[this.props.componentType].color
                                    .filter( ({value}) =>
                                            value === this.props.encodings[this.props.componentType].color.name )[0]
                                : []
                        }
                        placeholder="Pick how to visualize"
                        options={ options[this.props.componentType].color }
                        id={`${this.props.id}_select`}
                        name={`${this.props.name || this.props.id}_select`}
                        optionRenderer={({value, label}) => label}
                        onChange={this.handleSelectColorChange} />
                    {
                        this.props.componentType === 'point'
                            ?   <div>
                                    <h5>Show using size</h5>
                                    <RcSwitch
                                        checked={ isEncoded(this.props.encodings, this.props, 'size') }
                                        checkedChildren={'On'}
                                        unCheckedChildren={'Off'}
                                        onChange={ this.handleSelectSizeChange }/>
                                </div>
                            : null
                    }
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