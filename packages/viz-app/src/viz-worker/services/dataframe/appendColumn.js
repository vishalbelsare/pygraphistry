import { columns as createColumns } from 'viz-shared/models/columns';

export function appendColumn({ view, componentType, name, values, dataType }) {
    const { nBody } = view;
    const { dataframe } = nBody;
    view.componentsByType = undefined;
    view.inspector.rows = undefined;
    return (view.columns = createColumns(dataframe
        .addClientProvidedColumn(componentType, name, values, dataType)
        .getColumnsByType(true)
    ));
}

