import { PivotRow, PivotRowHeader } from 'pivot-shared/pivots';
import styles from './pivots.less';
import { Panel, Button } from 'react-bootstrap';

class PivotPanel extends React.Component {
  constructor(...args) {
    super(...args);
    this.state = {
      open: true
    };
  }

  render() {
      const { pivot, id, index, pivots, templates, togglePivots, searchPivot, 
          splicePivot, insertPivot } = this.props;
      return (
          <Panel 
              collapsible 
              expanded={this.state.open}
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
                          className={`fa fa-fw fa-caret-${this.state.open ? 'up' : 'left'}`}
                          onClick={(() => this.setState({open: !this.state.open}))}
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
      );
  }
}

export default function PivotTable({
    id, pivots, templates,
    insertPivot, splicePivot, searchPivot,
    togglePivots
}) {

    return (
        <div className={styles['pivot-table']}>
            <div>
            {
                pivots.map((pivot, index) => (
                    <PivotPanel 
                        id={id}
                        index={index}
                        key={index}
                        pivots={pivots}
                        pivot={pivot}
                        templates={templates}
                        insertPivot={insertPivot}
                        splicePivot={splicePivot}
                        searchPivot={searchPivot}
                        togglePivots={togglePivots}
                    />
                ))
            }
            </div>
            <Button block
                onClick={() => insertPivot({index: pivots.length - 1})}
            >{ 'Add new pivot' }</Button>
        </div>
    );
}
