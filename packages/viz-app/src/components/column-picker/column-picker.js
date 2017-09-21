import React from 'react';
import PropTypes from 'prop-types';
import Select from 'react-select';
import styles from './styles.less';
import classNames from 'classnames';
import { Modal, Button, OverlayTrigger, Tooltip, Popover } from 'react-bootstrap';

const ColumnPickerTooltip = (
    <Tooltip id='ColumnPickerTooltip'>
        Configure Inspector
    </Tooltip>
);

function sortOptions (templates) {
    const sortedTemplates = (templates || []).slice(0);
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
    id: PropTypes.string,//.isRequired,
    name: PropTypes.string,
    options: PropTypes.array,//.isRequired,
    value: PropTypes.array,//.isRequired,
    allowCreate: PropTypes.bool,
    onChange: PropTypes.func
};

export class ColumnPicker extends React.Component {

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
        if (!this.props.loading) {
            this.setState({ showModal: true });
        }
    }


    render(){

        const { loading = false } = this.props;
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
                .map(({identifier}) => options.findIndex((o) => o.identifier === identifier))
                .join(',');


        return (
            <OverlayTrigger placement='top'
                            delayShow={350}
                            overlay={ColumnPickerTooltip}>
                <Button onClick={this.open}
                        style={this.props.style}>
                    <i className={classNames({
                           'fa': true,
                           'fa-fw': true,
                           'fa-spin': loading,
                           'fa-cogs': !loading,
                           'fa-spinner': loading,
                       })}/>
                    <Modal show={this.state.showModal} onHide={this.close} dialogClassName={styles['column-picker-modal']}>
                        <Modal.Header closeButton>
                            <Modal.Title>Configure Inspector</Modal.Title>
                        </Modal.Header>
                        <Modal.Body>
                            <Select multi simpleValue
                                disabled={this.state.disabled}
                                value={values}
                                placeholder="Pick columns to show"
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
                                            !values ? []
                                            : (''+values).split(',')
                                                        .map((idx) => options[idx]));
                                    }
                                } />
                        </Modal.Body>
                        <Modal.Footer>
                            <Button onClick={this.close}>Close</Button>
                        </Modal.Footer>
                    </Modal>
                </Button>
            </OverlayTrigger>
        );
    }
}

ColumnPicker.propTypes = propTypes
