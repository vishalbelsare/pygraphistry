import { simpleflake } from 'simpleflakes';
import { migrateViews } from './migrateViews';
import { migrateDatasets } from './migrateDatasets';

export function migrateWorkbook(workbook, options) {
    if (!workbook.id) {
        workbook.id = simpleflake().toJSON();
    }
    return migrateDatasets(migrateViews(workbook), options);
}

