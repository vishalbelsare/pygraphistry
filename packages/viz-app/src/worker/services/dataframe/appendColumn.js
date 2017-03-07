import { columns as createColumns } from 'viz-app/models/columns';

export function appendColumn({ view, componentType, name, values, dataType }) {
    const { nBody } = view;
    const { dataframe } = nBody;
    if (dataframe.addClientProvidedColumn(componentType, name, values, dataType)) {
        view.componentsByType = undefined;
        view.inspector.rows = undefined;
        view.columns = createColumns(dataframe, dataframe.getColumnsByType(true));
    }
    return view.columns;
}

