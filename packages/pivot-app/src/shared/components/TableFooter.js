import { Component } from 'reaxtor';
import { tcell as tableCellClassName,
         tfoot as tableFooterClassName } from './styles.css';

export class TableFooter extends Component {
    loadProps(model) {
        return model.getItems(
            () => [`['total']`, `cols.length`, `rows.length`],
            ({ json: { cols, rows }}) => {
                if (cols.length === 0) {
                    return [];
                }
                const columnPaths = [
                    ['cols', { ...cols }, 'id']
                ];
                const rowPaths = rows.length === 0 ? [] : [
                    ['rows', { ...rows }, 'length'],
                    ['rows', { ...rows }, { ...cols }, 'value'],
                ];
                return columnPaths.concat(rowPaths);
            }
        );
    }
    render(model, { total, cols, rows }) {

        const cellWidth = Math.round(100 / (cols.length + 1));
        const columnVDoms = Array.from(cols).map((col, index) => ( Array
            .from(rows)
            .map((row) => row[index])
            .reduce((total, col) => total + col.value, 0)
        ))
        .map((total) => (
            <td style_={{ width: `${cellWidth}%` }}
                class_={{ [tableCellClassName]: true }}>
                <div class_={{ [tableCellClassName]: true }}>
                    <span>{total}</span>
                </div>
            </td>
        ))
        .concat(
            <td style_={{ width: `${cellWidth}%` }}
                class_={{ [tableCellClassName]: true }}>
                <div class_={{ [tableCellClassName]: true }}>
                    <span>{total}</span>
                </div>
            </td>
        );

        return (
            <tfoot class_={{ [tableFooterClassName]: true }}>
                <tr>{columnVDoms}</tr>
            </tfoot>
        );
    }
}
