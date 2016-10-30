import React from 'react';
import Select from 'react-select';
import { Modal, Button, OverlayTrigger, Tooltip, Popover } from 'react-bootstrap';
import classNames from 'classnames';

import styles from '../index.less';

function sortOptions (templates) {
    const sortedTemplates = templates.slice(0);
    sortedTemplates.sort((a,b) => {
        const aLower = a.attribute.toLowerCase();
        const bLower = b.attribute.toLowerCase();
        return aLower === bLower ? 0
            : aLower < bLower ? -1
            : 1;
    });
    return sortedTemplates;
}


const propTypes = {
    id: React.PropTypes.string.isRequired,
    name: React.PropTypes.string,
    options: React.PropTypes.array,//.isRequired,
    value: React.PropTypes.string,//.isRequired,
    allowCreate: React.PropTypes.bool,
    onChange: React.PropTypes.func
};

const defaultProps = {
    options: [
        {attribute: "edge:src", componentType: "edge", name: "src", dataType: "number"},
        {attribute: "edge:dst", componentType: "edge", name: "dst", dataType: "number"},
        {attribute: "point:degree", componentType: "point", name: "degree", dataType: "string"}
    ],
    value: []
};

export default class ColumnPicker extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            options: sortOptions(
                props.options.map(({componentType, name, dataType, attribute}) => {
                    return {
                        componentType, name, dataType, attribute,
                        value: attribute,
                        label: `${attribute} (${dataType})`
                }})),
            value: props.value,
            showModal: false
        };
        this.handleSelectChange = this.handleSelectChange.bind(this);
        this.close = this.close.bind(this);
        this.open = this.open.bind(this);
    }

    handleSelectChange (value) {
        this.setState({ value });
        if (this.props.onChange) {
            this.props.onChange(value);
        }
    }

    close() {
        this.setState({ showModal: false });
    }

    open() {
        this.setState({ showModal: true });
    }


    render(){

        return (<div id={this.props.id} name={this.props.name || this.props.id}>

            <Button href='javascript:void(0)'
                className={classNames({
                    [styles['fa']]: true,
                    [styles['fa-cogs']]: true
                })}
                onClick={this.open} />

            <Modal show={this.state.showModal} onHide={this.close}>
                <Modal.Header closeButton>
                    <Modal.Title>Pick fields</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Select multi simpleValue
                        disabled={this.state.disabled}
                        value={this.state.value}
                        placeholder="Pick fields"
                        options={this.state.options}
                        id={`${this.props.id}_select`}
                        name={`${this.props.name || this.props.id}_select`}
                        optionRenderer={
                            ({componentType, name, dataType}) => (
                                <span>
                                    <span>{`${componentType}:`}</span>
                                    <label>{name}</label>
                                    <span style={{
                                        'fontStyle': 'italic',
                                        'marginLeft': '5px'
                                        }}>{dataType}</span>
                                </span>) }
                        onChange={this.handleSelectChange} />
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={this.close}>Close</Button>
                </Modal.Footer>
            </Modal>
        </div>);
    }
}

ColumnPicker.propTypes = propTypes
ColumnPicker.defaultProps = defaultProps;
