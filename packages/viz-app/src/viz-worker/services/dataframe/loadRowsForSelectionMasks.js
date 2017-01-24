export function loadRowsForSelectionMasks({ view, columnNames, componentType, selectionMasks }) {

    const { nBody: { dataframe, vgraphLoaded } } = view;

    if (!dataframe || !vgraphLoaded) {
        return [];
    }

    const indexes = selectionMasks.getMaskForType(componentType);

    if (indexes.length <= 0) {
        return [];
    }

    columnNames = columnNames || dataframe.publicColumnNamesByType(componentType);

    return dataframe.getRows(indexes, componentType, columnNames, false);
}
