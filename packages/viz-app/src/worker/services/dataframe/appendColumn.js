import { columns as createColumns } from 'viz-app/models/columns';

export function appendColumn({ view, componentType, name, values, dataType }) {
  let column = null;
  const { nBody } = view;
  const { dataframe } = nBody;
  if (dataframe.addClientProvidedColumn(componentType, name, values, dataType)) {
    view.componentsByType = undefined;
    view.inspector.rows = undefined;
    column = dataframe.getColumn(name, componentType, false, true);
    column = createColumns(dataframe, { [componentType]: { [name]: column } })[0];
    (view.columns || (view.columns = [])).push(column);
  }
  return column;
}
