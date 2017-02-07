import { PivotRow, PivotRowHeader } from 'pivot-shared/pivots';
import styles from './pivots.less';
import { PanelGroup, Panel, Button } from 'react-bootstrap';

const PivotPanels = React.createClass({
    getInitialState() {
        return {
            activeKey: '1'
        };
    },

    handleSelect(activeKey) {
        if (activeKey === this.state.activeKey) {
            this.setState({ activeKey: '' });
        } else {
            this.setState({ activeKey });
        }
    },

    render() {
        const {
            pivots,
            id,
            templates,
            togglePivots,
            insertPivot,
            searchPivot,
            splicePivot
        } = this.props;
        return (
            <PanelGroup
                activeKey={this.state.activeKey}
                onSelect={this.handleSelect}
                accordion
            >
                {
                    pivots.map((pivot, index) => (
                            <Panel eventKey={index}
                                header={
                                    <PivotRowHeader
                                        data={pivot}
                                        investigationId={id}
                                        rowIndex={index}
                                        pivots={pivots}
                                        templates={templates}
                                        togglePivots={togglePivots}
                                    />
                                }
                                footer={
                                    <span className={styles['pivot-footer']}>
                                        <i style={{float: 'right', width: '100%', textAlign: 'right'}}
                                            className={`fa fa-fw fa-caret-${this.state.activeKey === index ? 'up' : 'left'}`}
                                            onClick={((event) => {
                                                event.preventDefault()
                                                this.handleSelect(index)
                                            })}
                                        />
                                    </span>
                                }
                                key={index}
                            >
                                <PivotRow data={pivot}
                                    pivots={pivots}
                                    rowIndex={index}
                                    investigationId={id}
                                    templates={templates}
                                    searchPivot={searchPivot}
                                    splicePivot={splicePivot}
                                    insertPivot={insertPivot}
                                    togglePivots={togglePivots}
                                    handleSelect={this.handleSelect}
                                    key={`${index}: ${pivot.id}`}
                                />
                            </Panel>
                    ))
                }
            </PanelGroup>
        );
    }
});

export default function PivotTable({
    id, pivots, templates,
    insertPivot, splicePivot, searchPivot,
    togglePivots
}) {

    return (
        <div className={styles['pivot-table']}>
            <PivotPanels
                id={id}
                pivots={pivots}
                templates={templates}
                insertPivot={insertPivot}
                splicePivot={splicePivot}
                searchPivot={searchPivot}
                togglePivots={togglePivots}
            />
            <Button block
                onClick={() => insertPivot({index: pivots.length - 1})}
            >{ 'Add new pivot' }</Button>
        </div>
    );
}
