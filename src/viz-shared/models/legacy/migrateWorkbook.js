import flake from 'simpleflake';
import { migrateViews } from './migrateViews';
import { migrateDatasets } from './migrateDatasets';

export function migrateWorkbook(workbook) {
    if (!workbook.id) {
        workbook.id = flake().toString('hex');
    }
    return migrateDatasets(migrateViews(workbook));
}

