import { Container } from 'reaxtor';
import { TableCell } from './TableCell';
import { tcell as tableCellClassName,
         splice as spliceIconClassName,
         search as searchIconClassName } from './styles.css';

export class TableHeader extends Container {
    loadProps(model) {
        return model.getItems(
            () => `['id', 'length']`,
            ({ json: { length }}) => !length ? [] : [
                [{ length }, this.field]
            ]
        );
    }

    createChild(props) {
        const cellType = 'text';
        const isHeader = true
        return new TableCell({
            ...props, field: this.field, type: cellType, isHeader: isHeader
        });
    }
    render(model, { id, length = 0}, ...cellVDoms) {

        const rowType = this.type || 'td';
        const cellWidth = Math.round(95 / (length + 1));

        const createTableCell = (cellVDom) => {
            return (<th style_={{ width: `${cellWidth}%` }}>{cellVDom}</th>);
        };

        const tableCellVDoms = cellVDoms.concat(
                <div class_={{ [tableCellClassName]: true }}>
                    <span> Result Count </span>
                    <i on-click={[this.onSpliceRow, id]} class_={{ [spliceIconClassName]: true }}/>
                    <i on-click={[this.onSelectPivot, id]} class_={{ [searchIconClassName]: true }}/>
                </div>
            )
            .map(createTableCell);

        return (<tr>
                <th style_={{ width: `2%` }}> &nbsp; </th>
                {tableCellVDoms}
            </tr>) 
    }
}



