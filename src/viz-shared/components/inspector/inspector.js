import React, { PropTypes } from 'react';
import styles from './styles.less';

import {
    compose,
    getContext,
    shallowEqual
} from 'recompose';

import { Tab, Tabs, Table, Pagination, FormControl, InputGroup, Button } from 'react-bootstrap';

import _ from 'underscore';

const propTypes = {
    templates: React.PropTypes.array,
    rows: React.PropTypes.array,
    openTab: React.PropTypes.string,
    searchTerm: React.PropTypes.string,
    sortKey: React.PropTypes.string,
    sortOrder: React.PropTypes.string,
    toggleColumnSort: React.PropTypes.func,
    numPages: React.PropTypes.number,
    page: React.PropTypes.number,
    rowsPerPage: React.PropTypes.number,
    onSelect: React.PropTypes.func,
    onPageSelect: React.PropTypes.func
};

const datatablePropTypes =
    _.extend(
        {entityType: React.PropTypes.string},
        propTypes);



const datatableDefaultProps = {
    toggleColumnSort: (field) => {
        console.log('toggle column sort on', field);
    },
    handlePageSelect: (pageNumber) => {
        console.log('handle page select of page', pageNumber);
    }
};

class DataTable extends React.Component {
    constructor(props) {
        super(props);
    }

    render () {

        const firstRow = this.props.rowsPerPage * (this.props.page - 1);

        const { templates } = this.props;

        console.log('PRINTING ROWS', {firstRow, rowsPerPage: this.props.rowsPerPage, page: this.props.page});

        return (
            <div>
                <div className={styles['inspector-table-header']}>

                     <Pagination
                        prev
                        next
                        first
                        last
                        ellipsis
                        boundaryLinks
                        items={this.props.numPages}
                        maxButtons={5}
                        activePage={this.props.page}
                        onSelect={this.props.onPageSelect} />
                    <InputGroup>
                         <FormControl
                            type="text"
                            value={this.props.searchTerm}
                            placeholder="Search"
                          />
                        <Button>
                            <i className={`
                                ${styles['fa']}
                                ${styles['fa-fw']}
                                ${styles['fa-search']}`}></i>
                        </Button>
                    </InputGroup>


                </div>
                <Table className={styles['inspector-table']}
                    striped={true} bordered={true} condensed={true} hover={true}>
                <thead>
                    {templates.map(({name}) => <th onClick={ () => this.props.toggleColumnSort({
                        clickedField: name, currentField: this.props.sortKey, currentOrder: this.props.sortOrder
                    })}>
                        {name}
                        { this.props.sortKey === name
                            ? <i className={`
                                ${styles['sort-active']}
                                ${styles['fa']}
                                ${styles['fa-fw']}
                                ${styles['fa-sort-' + this.props.sortOrder]}`}></i>
                            : <i className={`
                                ${styles['sort-inactive']}
                                ${styles['fa']}
                                ${styles['fa-fw']}
                                ${styles['fa-sort']}`}></i>
                        }
                    </th>)}
                </thead>
                <tbody>{
                    _.range(firstRow, firstRow + this.props.rowsPerPage)
                        .map((row) => (<tr>{
                            templates.map(({name}) => (<td>{
                                this.props.rows && this.props.rows[row]
                                    ? this.props.rows[row][name]
                                    : ''
                            }</td>))
                        }</tr>))
                }</tbody>
            </Table>
        </div>);
    }
}

DataTable.propTypes = datatablePropTypes;
DataTable.defaultProps = datatableDefaultProps;



class Inspector extends React.Component {

    constructor(props) { super(props); }

    render() {
        return <div className={styles.inspector}>
            <Tabs className={styles.inspectorTabs}
                    activeKey={this.props.openTab}  onSelect={this.props.onSelect}>
                <Tab eventKey={'points'} title="Points">
                    <DataTable {...this.props} entityType={"Node"}/>
                </Tab>
                <Tab eventKey={'edges'} title="Edges">
                    <DataTable {...this.props} entityType={"Edge"}/>
                </Tab>
            </Tabs>
        </div>;
    }

}
Inspector.propTypes = propTypes;

export { Inspector };



