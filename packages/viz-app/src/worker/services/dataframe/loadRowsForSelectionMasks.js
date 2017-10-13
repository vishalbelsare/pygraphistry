export function loadRowsForSelectionMasks({ view, columnNames, componentType, selectionMasks }) {
    const { nBody: { dataframe, vgraphLoaded } } = view;

    if (!dataframe || !vgraphLoaded) {
        return [];
    }

    if (componentType === 'event') {
        componentType = 'point';
    }

    const indexes = selectionMasks.getMaskForType(componentType);

    if (indexes.length <= 0) {
        return [];
    }

    columnNames = (columnNames || dataframe.getAttributeKeys(componentType))
        .map(columnName => dataframe.getAttributeKeyForColumnName(columnName, componentType))
        .filter(columnName => columnName !== '_index');

    return dataframe.getRows(indexes, componentType, columnNames, false);
}
