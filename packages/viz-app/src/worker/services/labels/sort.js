export const mostImportantEntityKeys = [
    'product',
    'scanners',
    'alerts',

    'Pivot',
    'canonicalType',
    'cols',
    'refTypes',
    'index',
    'vendor',
    'searchLink'
];

export const mostImportantEventKeys = [
    'Source',
    'Destination',

    'time',
    'Pivot',

    'src',
    'src_hostname',
    'src_ip',
    'src_mac',
    'src_port',
    'src_user',
    'dest',
    'dest_hostname',
    'dest_ip',
    'dest_location',
    'dest_mac',
    'dest_port',
    'dest_user',
    'user',

    'scanners',
    'alerts',

    'msg',
    'fname',
    'filename',
    'fileHash',
    'filePath',
    'link',
    'url',

    'type',
    'edgeType',
    'cols',
    'vendor',
    'product',
    'index',
    'searchLink',
    'externalId'
];

function sortKeys(cols, order) {
    return cols
        .map(kv => {
            const topKeyIndex = order.indexOf(kv.key);
            return topKeyIndex > -1 ? { topKeyIndex, ...kv } : null;
        })
        .filter(kv => kv)
        .sort(({ topKeyIndex: k1 }, { topKeyIndex: k2 }) => k1 - k2);
}

//[ {key, value} ] -> [ {key, value, topKeyIndex}]
//Select subset of fields and return in sorted order
export function selectImportantKeys(columns = []) {
    //Event
    return columns.some(
        ({ key, value }) =>
            (key === 'type' && value === 'EventID') ||
            (key === 'edgeType' && value.match(/^EventID-((&gt;)|>)/))
    )
        ? sortKeys(columns, mostImportantEventKeys)
        : //Entity
          columns.some(({ key, value }) => key === 'canonicalType')
          ? sortKeys(columns, mostImportantEntityKeys)
          : //Wazzat
            undefined;
}
