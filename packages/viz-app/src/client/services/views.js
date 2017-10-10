import Color from 'color';
import { loadResource } from './resource';
import { ref as $ref } from '@graphistry/falcor-json-graph';
import { view as createView } from 'viz-app/models/views';
import { dataset as createDataset } from 'viz-app/models/workbooks';

export function loadViews(loadWorkbooksById) {
  return function loadViewsById({ workbookIds, viewIds, options = {} }) {
    return loadWorkbooksById({
      workbookIds,
      options
    }).mergeMap(
      ({ workbook }) => viewIds,
      ({ workbook }, viewId) => ({
        workbook,
        view: assignViewToWorkbook(
          workbook,
          workbook.viewsById[viewId] || createView(workbook.id, viewId)
        )
      })
    );
  };
}

function assignViewToWorkbook(workbook, view) {
  const { id: viewId, scene } = view;
  const { id: workbookId, viewsById, views } = workbook;
  const { scene: sceneID = 'default' } = getCurrentDataset(workbook);

  scene.id = sceneID;
  scene.renderer.id = sceneID;

  let background = dataset.bg;

  if (typeof background !== 'undefined') {
    try {
      background = new Color(background);
    } catch (e) {
      background = undefined;
    }
  }

  if (background === undefined) {
    background = scene.background.color;
    if (sceneID === 'transparent') {
      background.alpha(0);
    }
  }

  scene.background.color = background;

  if (!viewsById[viewId]) {
    const viewIndex = views.length;
    const currentView = views.current;
    viewsById[viewId] = view;
    views.length = viewIndex + 1;
    views[viewIndex] = $ref(`workbooksById['${workbookId}'].views.current`);
    if (!currentView) {
      views.current = $ref(`workbooksById['${workbookId}'].viewsById['${viewId}']`);
    }
  }

  return view;
}

function getCurrentDataset(workbook, options) {
  const { datasets } = workbook;

  let datasetsIndex = -1;
  const datasetsLen = datasets.length;
  const datasetName = options.dataset;

  while (++datasetsIndex < datasetsLen) {
    const dataset = datasets[datasetsIndex];
    if (dataset.name === datasetName || datasetName == null) {
      return dataset;
    }
  }

  return datasets[datasetsIndex] || (datasets[datasetsIndex] = createDataset(options));
}
