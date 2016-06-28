export function assignCurrentDataset(workbook, options) {

    const { datasets } = workbook;
    const {
        type = 'default',
        scene = 'default',
        mapper = 'default',
        device = 'default',
        vendor = 'default',
        controls = 'default' } = options;

    let datasetName = options.dataset;
    let backgroundColor = options.bg;
    const datasetConfig = {
        type, scene, mapper,
        device, vendor, controls,
        backgroundColor
    };

    let datasetsIndex = -1;
    const datasetsLen = datasets.length;

    while (++datasetsIndex < datasetsLen) {

        const dataset = datasets[datasetsIndex];

        if (dataset.name === datasetName || datasetName == null) {
            break;
        }
    }

    datasets.current = datasets[datasetsIndex];

    return workbook;
}
