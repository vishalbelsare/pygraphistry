import { Container } from 'reaxtor';
import { TableCell } from './TableCell';
import { tcell as tableCellClassName,
         splice as spliceIconClassName,
         search as searchIconClassName,
         insert as insertIconClassName} from './styles.css';

export class TableRow extends Container {
    loadProps(model) {
        return model.getItems(
            () => `['id', 'length', 'enabled', 'resultCount']`,
            ({ json: { length }}) => !length ? [] : [
                [{ length }, this.field]
            ]
        );
    }

    loadState(model, props) {
        var togglePivot = this.listen('toggle');
        return togglePivot
            .switchMap((event) =>
            model.call('togglePivot'))
            .switchMapTo(this.loadProps(model))
    }
    createChild(props) {
        const cellType = 'text';
        const isHeader = false;
        return new TableCell({
            ...props, field: this.field, type: cellType, isHeader: isHeader
        });
    }
    render(model, { id, length = 0, enabled, resultCount}, ...cellVDoms) {

        const rowType = this.type || 'td';
        const cellWidth = Math.round(95 / (length + 1));

        const createTableCell = (cellVDom) => 
            (<td style_={{ width: `${cellWidth}%` }}>{cellVDom}</td>)        

        const tableCellVDoms = cellVDoms.concat(
                <div class_={{ [tableCellClassName]: true }}>
                    <span> {(rowType === 'th') ? 'Result Count' : resultCount} </span>
                    <i on-click={[this.onSpliceRow, id]} class_={{ [spliceIconClassName]: true }}/>
                    <i on-click={[this.onInsertRow, id]} class_={{ [insertIconClassName]: true }}/>
                    <i on-click={[this.onSearchPivot, id]} class_={{ [searchIconClassName]: true }}/>
                </div>
            )
            .map(createTableCell);

        return (
            <tr>
                <td style_={{ width: `2%` }}>
                    <input 
                        type="checkbox" 
                        on-click={this.dispatch('toggle')}
                        checked={enabled}/>
                </td>
                {tableCellVDoms}
            </tr>
            );
    }
}



