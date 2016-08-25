export function getIDsFromJSON({ workbooksById = {} }) {

    const setIds = [];
    const toolIds = [];
    const viewIds = [];
    const filterIds = [];
    const datasetIds = [];
    const controlIds = [];
    const settingIds = [];
    const workbookIds = [];

    for (const workbookId in workbooksById) {

        workbookIds.push(workbookId);
        const workbook = workbooksById[workbookId];
        const { viewsById = {} } = workbook;

        for (const viewId in viewsById) {

            viewIds.push(viewId);
            const view = viewsById[viewId];
            const { scene,
                    setsById = {},
                    toolsById = {},
                    filtersById = {} } = view;
            const { settingsById = {} } = scene ? scene : view;

            for (const setId in setsById) { setIds.push(setId); }
            for (const toolId in toolsById) { toolIds.push(toolId); }
            for (const filterId in filtersById) { filterIds.push(filterId); }
            for (const settingId in settingsById) {

                settingIds.push(settingId);
                const settings = settingsById[settingId];
                const { controlsById = {} } = settings;

                for (const controlId in controlsById) {
                    controlIds.push(controlId);
                }
            }
        }
    }

    return { setIds, toolIds, viewIds, filterIds,
             workbookIds, controlIds, settingIds };
}
