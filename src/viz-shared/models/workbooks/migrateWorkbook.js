import { simpleflake } from 'simpleflakes';
import { migrateViews } from './migrateViews';
import { migrateDatasets } from './migrateDatasets';

const converters = {
    '0': (workbook, options) => {
        if (!workbook.id) {
            workbook.id = simpleflake().toJSON();
        }
        return migrateDatasets(migrateViews(workbook), options)
    },
    '1': (workbook) => workbook,
}

export function migrateWorkbook(workbook, options) {
    const wbVersion = workbook.version || 0;
    if (wbVersion in converters) {
        return converters[wbVersion](workbook, options)
    } else {
        throw new Error('Unknown workbook version, cannot migrate', wbVersion);
    }
}

