export function createDataset(datasetID, options) {
    const dataset = {
        id: datasetID, type: 'default', scene: 'default', mapper: 'default',
        device: 'default', vendor: 'default', controls: 'default', ... options
    };
    dataset.url = dataset.url || options.dataset;
    dataset.name = dataset.name || options.dataset;
    // delete dataset.dataset;
    return dataset;
}

