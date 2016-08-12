import { Container } from 'reaxtor';
import { TableCell } from './TableCell';
import { tcell as tableCellClassName,
         splice as spliceIconClassName,
         search as searchIconClassName } from './styles.css';

export class TableRow extends Container {
    loadProps(model) {
        return model.getItems(
            () => `['id', 'length', 'enabled']`,
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
        //const cellType = this.type === 'th' ? 'text' : 'number';
        const cellType = 'text';
        const isHeader = this.type === 'th'
        return new TableCell({
            ...props, field: this.field, type: cellType, isHeader: isHeader
        });
    }
    render(model, { id, length = 0, enabled}, ...cellVDoms) {

        const rowType = this.type || 'td';
        const cellWidth = Math.round(95 / (length + 1));

        const createTableCell = (cellVDom) => {
            return (rowType === 'td') ? (
                <td style_={{ width: `${cellWidth}%` }}>{cellVDom}</td>) : (
                <th style_={{ width: `${cellWidth}%` }}>{cellVDom}</th>);
        };

        const tableCellVDoms = cellVDoms.concat(
                <div class_={{ [tableCellClassName]: true }}>
                    <i on-click={[this.onSpliceRow, id]} class_={{ [spliceIconClassName]: true }}/>
                    <i on-click={[this.onSelectPivot, id]} class_={{ [searchIconClassName]: true }}/>
                </div>
            )
            .map(createTableCell);

        return (rowType === 'th') ? (
            <tr>
                <th style_={{ width: `2%` }}> &nbsp; </th>
                {tableCellVDoms}
            </tr>) 
            : (
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



