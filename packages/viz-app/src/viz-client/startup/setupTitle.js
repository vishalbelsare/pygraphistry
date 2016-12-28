export function setupTitle(document, options) {

    const {
        dataset, client, workbook, titleSeparator = ' - ',
        companyProductLabel = 'Graphistry\'s Graph Explorer',
    } = options;

    if (dataset) {
        if (client === 'static') {
            document.title = `${dataset} (exported)${titleSeparator}${companyProductLabel}`;
        } else {
            document.title = `${dataset}${titleSeparator}${companyProductLabel}`;
        }
    } else if (workbook) {
        document.title = `${workbook}${titleSeparator}${companyProductLabel}`;
    } else {
        document.title = companyProductLabel;
    }

    return options;
}
