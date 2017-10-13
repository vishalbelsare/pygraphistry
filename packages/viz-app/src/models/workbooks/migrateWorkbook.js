import { inspect } from 'util';
import migrateV0 from './v0';
import migrateV1 from './v1';
import migrateV2 from './v2';
import { latestWorkbookVersion } from './index';

const converters = {
    '0': migrateV0,
    '1': migrateV1,
    '2': migrateV2,
    '3': wb => wb
};

export function migrateWorkbook(workbook, options) {
    let wbVersion = workbook.version || 0;
    while (wbVersion < latestWorkbookVersion) {
        if (wbVersion in converters) {
            workbook = converters[wbVersion](workbook, options);
            workbook.version = ++wbVersion;
        } else {
            throw new Error('Unknown workbook version, cannot migrate', wbVersion);
        }
    }
    return workbook;
}
