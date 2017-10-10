import Color from 'color';
import { Observable } from 'rxjs/Observable';
import { view as createView } from 'viz-app/models/views';
import { $ref, $atom } from '@graphistry/falcor-json-graph';
import {
  overrideLayoutOptionParams,
  toClient as fromLayoutAlgorithms
} from '../simulator/layout.config';

export function loadViews(loadDatasetNBody, loadWorkbooksById) {
  return function loadViewsById({ workbookIds, viewIds, options = {} }) {
    return loadWorkbooksById({
      workbookIds,
      options
    })
      .mergeMap(
        ({ workbook }) => loadDatasetNBody({ workbook, options }),
        ({ workbook }, nBody) => ({ workbook, nBody })
      )
      .mergeMap(
        ({ workbook, nBody }) => viewIds,
        ({ workbook, nBody }, viewId) => ({
          workbook,
          view: assignViewToWorkbook(
            workbook,
            assignNBodyToView(
              workbook,
              nBody,
              workbook.viewsById[viewId] || createView(workbook.id, nBody.scene.id, viewId)
            )
          )
        })
      );
  };
}

export function moveSelectedNodes(loadViewsById) {
  return function moveSelectedNodes({ workbookIds, viewIds, coords = { x: 0, y: 0 } }) {
    const { x, y } = coords;

    if (x === 0 && y === 0) {
      return Observable.empty();
    }

    return loadViewsById({
      workbookIds,
      viewIds
    }).mergeMap(({ workbook, view }) => {
      const { nBody, selection = {} } = view;
      const { point: points } = selection;

      if (!nBody || !points || points.length <= 0) {
        return Observable.of({ workbook, view, points: [] });
      }

      return Observable.from(nBody.simulator.moveNodesByIds(points, { x, y }))
        .do(() => {
          const { server } = nBody;
          if (server && server.updateVboSubject) {
            server.updateVboSubject.next(true);
          }
        })
        .mapTo({ workbook, view, points });
    });
  };
}

function assignViewToWorkbook(workbook, view) {
  const { id: viewId } = view;
  const { id: workbookId, viewsById, views } = workbook;

  if (!view.session) {
    view.session = {
      status: 'init',
      progress: 100 * 1 / 10,
      message: `Locating Graphistry's farm`
    };
  }

  if (!viewsById[viewId]) {
    const viewIndex = views.length;
    const currentView = views.current;

    viewsById[viewId] = view;
    views.length = viewIndex + 1;
    views[viewIndex] = $ref(`workbooksById['${workbookId}'].viewsById['${viewId}']`);

    if (!currentView) {
      views.current = $ref(`workbooksById['${workbookId}'].views['${viewIndex}']`);
    }
  }

  return view;
}

function assignNBodyToView(workbook, nBody, view) {
  const { scene, layout } = view;
  const { simulator: { controls } } = nBody;

  if (!view.nBody) {
    nBody.view = view;
    view.nBody = nBody;

    let background = nBody.bg;

    if (typeof background !== 'undefined') {
      try {
        background = new Color(background);
      } catch (e) {
        background = scene.renderer.background.color;
      }
    } else {
      background = scene.renderer.background.color;
    }

    scene.simulating = false;
    scene.renderer.background.color = background;

    const { controlsName } = controls;
    const layoutAlgorithms = fromLayoutAlgorithms(controls.layoutAlgorithms);

    layout.settings = layoutAlgorithms.map(({ name }) =>
      $ref(
        `workbooksById['${workbook.id}'].viewsById['${view.id}'].layout.options['${name.toLowerCase()}']`
      )
    );

    layout.options = mergeLayoutControlsAndOptions(
      controlsName,
      layoutAlgorithms,
      layout.options || []
    );
  }

  return view;
}

const controlLeafKeys = {
  displayName: true,
  id: true,
  type: true,
  name: true,
  value: true
};

function mergeLayoutControlsAndOptions(controlsName, layoutAlgorithms, viewLayoutOptions) {
  function reduceToMapById(map, val) {
    if (val && typeof val === 'object') {
      map[val.id || val.name] = val;
    }
    return map;
  }

  const isLockedRControls = controlsName === 'lockedAtlasBarnesR';
  const isLockedXYControls = controlsName === 'lockedAtlasBarnesXY';
  const isLockedXControls = isLockedXYControls || controlsName === 'lockedAtlasBarnesX';
  const isLockedYControls = isLockedXYControls || controlsName === 'lockedAtlasBarnesY';

  return layoutAlgorithms.reduce((options, layoutAlgorithm) => {
    const { name: layoutAlgoName, params: layoutAlgoParams } = layoutAlgorithm;
    const layoutAlgoId = layoutAlgoName.toLowerCase();
    const layoutOptionsById = Array.from(
      layoutAlgoId in viewLayoutOptions
        ? viewLayoutOptions[layoutAlgoId]
        : 'length' in viewLayoutOptions ? viewLayoutOptions : []
    ).reduce(reduceToMapById, Object.create(null));

    options[layoutAlgoId] = layoutAlgoParams.reduce(
      (layoutOptions, control) => {
        let option,
          { type, value, name, displayName, id = name } = control;
        if (!(option = layoutOptionsById[id])) {
          option = {
            id,
            type,
            name: displayName || name,
            props: Object.keys(control)
              .filter(x => !(x in controlLeafKeys))
              .reduce((xs, x) => ((xs[x] = control[x]) && xs) || xs, Object.create(null))
          };
        } else if (id === 'lockedR') {
          value = isLockedRControls;
        } else if (id === 'lockedX') {
          value = isLockedXControls;
        } else if (id === 'lockedY') {
          value = isLockedYControls;
        } else {
          value = option.value;
        }
        option.value = value;
        layoutOptions[layoutOptions.length++] = option;
        return layoutOptions;
      },
      { length: 0, id: layoutAlgoId, name: layoutAlgoName }
    );

    return options;
  }, {});
}
