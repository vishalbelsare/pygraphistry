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



class DataTable extends React.Component {
    constructor(props) {
        super(props);
    }

    render () {

        const firstRow = this.props.rowsPerPage * (this.props.page - 1);

        const { templates, entityType } = this.props;

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
                <div className={styles['inspector-table-container']}>
                <Table className={styles['inspector-table']}
                    striped={true} bordered={true} condensed={true} hover={true}>
                <thead>
                    {templates.map(({name}) => (
                        <th  className={ this.props.sortKey === name ? styles['isSorting'] : null }
                                onClick={ () => this.props.toggleColumnSort({name}) }>
                            {name === '_title' ? entityType : name}
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
                        </th>))}
                </thead>
                <tbody>{
                    _.range(firstRow, firstRow + this.props.rowsPerPage)
                        .map((row) => (<tr>{
                            templates.map(({name}) => (<td>{
                                this.props.rows && this.props.rows[row]
                                    ? this.props.rows[row][name]
                                    : '\u00a0' // nbsp forces height sizing
                            }</td>))
                        }</tr>))
                }</tbody>
            </Table>
            </div>
        </div>);
    }
}

DataTable.propTypes = datatablePropTypes;



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



