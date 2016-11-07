import React from 'react';
import Select from 'react-select';
import { Modal, Button, OverlayTrigger, Tooltip, Popover } from 'react-bootstrap';
import classNames from 'classnames';

import styles from '../index.less';
import localStyles from '../components/column-picker/styles.less';

function sortOptions (templates) {
    const sortedTemplates = templates.slice(0);
    sortedTemplates.sort((a,b) => {
        const aLower = a.identifier.toLowerCase();
        const bLower = b.identifier.toLowerCase();
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

export default class ColumnPicker extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            showModal: false
        };
        this.close = this.close.bind(this);
        this.open = this.open.bind(this);
    }

    close() {
        this.setState({ showModal: false });
    }

    open() {
        this.setState({ showModal: true });
    }


    render(){

        const options =
            sortOptions(this.props.options)
                .map( ({identifier, dataType, ...rest}, idx) => ({
                    identifier, dataType, ...rest,
                    value: '' + idx,
                    label: `${identifier} (${dataType})`
                }));

        //str
        const values =
            this.props.value
                .map(({identifier}) => _.findIndex(options, (o) => o.identifier === identifier))
                .join(',');


        return (<div id={this.props.id} name={this.props.name || this.props.id}>

            <Button href='javascript:void(0)'
                className={classNames({
                    [styles['fa']]: true,
                    [styles['fa-cogs']]: true
                })}
                onClick={this.open} />

            <Modal show={this.state.showModal} onHide={this.close} dialogClassName={localStyles['column-picker-modal']}>
                <Modal.Header closeButton>
                    <Modal.Title>Pick fields</Modal.Title>
                </Modal.Header>
                <Modal.Body>
                    <Select multi simpleValue
                        disabled={this.state.disabled}
                        value={values}
                        placeholder="Pick fields"
                        options={options}
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
                        onChange={
                            (values) => {
                                return this.props.onChange(
                                            (''+values).split(',')
                                                .map((idx) => options[idx]))
                            }
                        } />
                </Modal.Body>
                <Modal.Footer>
                    <Button onClick={this.close}>Close</Button>
                </Modal.Footer>
            </Modal>
        </div>);
    }
}

ColumnPicker.propTypes = propTypes
