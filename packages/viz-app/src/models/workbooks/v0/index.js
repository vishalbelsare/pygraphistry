import migrateV1 from '../v1';
import { simpleflake } from 'simpleflakes';
import { migrateViews } from './migrateViews';
import { migrateDatasets } from './migrateDatasets';

export default function migrateV0(workbook, options) {
    if (!workbook.id) {
        workbook.id = simpleflake().toJSON();
    }
    if (workbook.viewsById) {
        return migrateV1(workbook);
    }
    return migrateViews(migrateDatasets(workbook, options));
}
