import { simpleflake } from 'simpleflakes';
import { migrateViews } from './migrateViews';
import { migrateDatasets } from './migrateDatasets';

export default function migrateV0(workbook, options) {
    if (!workbook.id) {
        workbook.id = simpleflake().toJSON();
    }
    return migrateViews(migrateDatasets(workbook, options));
}
