import React, { PropTypes } from 'react';
import styles from './styles.less';

import {
    compose,
    getContext,
    shallowEqual
} from 'recompose';

import { Tab, Tabs, Table, Pagination, FormControl, InputGroup, Button } from 'react-bootstrap';

import _ from 'underscore';




const datatablePropTypes = {
    columns: React.PropTypes.array,
    results: React.PropTypes.array,
    sortKey: React.PropTypes.string,
    sortOrder: React.PropTypes.string,
    searchTerm: React.PropTypes.string,
    toggleColumnSort: React.PropTypes.func,
    numPages: React.PropTypes.number,
    page: React.PropTypes.number,
    rowsPerPage: React.PropTypes.number,
    handlePageSelect: React.PropTypes.func
};

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
        console.log('DataTable props', props);
    }

    render () {

        const start = this.props.rowsPerPage * this.props.page;
        const stop = start + this.props.rowsPerPage;

        const columns =
            _.range(0,this.props.templates.length)
                .map((idx) => this.props.templates[idx])
                .filter(({componentType}) =>
                    (this.props.openTab === 'points' && componentType === 'point')
                    || (this.props.openTab === 'edges' && componentType === 'edge'));

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
                        onSelect={this.props.handlePageSelect} />

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
                    {columns.map(({name}) => <th onClick={ () => this.props.toggleColumnSort({
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
                    _.range(start, stop)
                        .map((row) => (<tr>{
                            columns.map(({name}) => (<td>{
                                this.props.rows ? this.props.rows[row][name] : `placeholder:${row}:${name}`
                            }</td>)
                        )}</tr>))
                }</tbody>
            </Table>
        </div>);
    }
}

DataTable.propTypes = datatablePropTypes;
DataTable.defaultProps = datatableDefaultProps;



class Inspector extends React.Component {

    constructor(props) {
        super(props);
    }

    render() {

        const { open, templates,
                onSelect,
                openTab, searchTerm, sortKey, sortOrder, rowsPerPage, page }
            = this.props;

        const start = rowsPerPage * page;
        const stop = start + rowsPerPage;

        const fakeData = {
            sort: {
                column: 'name',
                ascending: true
            },
            numPages: 1,
            page: 0,
            results: [
                    {
                        "id": 0,
                        "name": "Mayer Leonard",
                        "city": "Kapowsin",
                        "state": "Hawaii",
                        "country": "United Kingdom",
                        "company": "Ovolo",
                        "favoriteNumber": 7
                    },
                     {
                        "id": 10,
                        "name": "Bullwinkle",
                        "city": "Moscow",
                        "stata": null,
                        "country": "USSR",
                        "company": "ACME",
                        "favoriteNumber": 10
                    },
                ],
            cols: ['id', 'name', 'city', 'company', 'favoriteNumber']
        };


        return <div className={styles.inspector}>
            <Tabs activeKey={openTab} className={styles.inspectorTabs} onSelect={onSelect}>
                <Tab eventKey={'points'} title="Points">
                    <DataTable
                        {...this.props}
                        results={fakeData.results}
                        columns={fakeData.cols}
                        numPages={fakeData.numPages}
                        entityType={"Node"}/>
                </Tab>
                <Tab eventKey={'edges'} title="Edges">
                    <DataTable
                        {...this.props}
                        results={fakeData.results}
                        columns={fakeData.cols.slice(0,3)}
                        numPages={fakeData.numPages}
                        entityType={"Edge"}/>
                </Tab>
            </Tabs>
        </div>;

    }
}

export { Inspector };



