import migrateV0 from './v0';
import migrateV1 from './v1';
import { latestWorkbookVersion } from './index';

const converters = {
    '0': migrateV0,
    '1': migrateV1,
};

export function migrateWorkbook(workbook, options) {
    const wbVersion = workbook.version || 0;
    if (wbVersion in converters) {
        workbook = converters[wbVersion](workbook, options);
        workbook.version = latestWorkbookVersion;
        return workbook;
    } else {
        throw new Error('Unknown workbook version, cannot migrate', wbVersion);
    }
}

