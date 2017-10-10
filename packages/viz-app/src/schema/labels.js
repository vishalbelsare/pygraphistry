import Color from 'color';
import { Observable } from 'rxjs';
import { getHandler, setHandler } from 'viz-app/router';
import { $ref, $value } from '@graphistry/falcor-json-graph';

export function labels(path, base) {
  return function labels({ loadViewsById, loadLabelsByIndexAndType }) {
    const getValues = getHandler(path, loadViewsById);
    const setValues = setHandler(path, loadViewsById);
    const setColors = setHandler(
      path,
      loadViewsById,
      (node, key, color, path, data) =>
        Observable.of({
          path,
          value: (node[key] = new Color(color))
        }),
      { color: true }
    );

    return [
      {
        get: getValues,
        set: setValues,
        route: `${base}['labels'][
                'id', 'name', 'opacity', 'enabled', 'renderer',
                'timeZone', 'highlight', 'selection', 'poiEnabled',
                'encodings', 'highlightEnabled'
            ]`
      },
      {
        get: getValues,
        set: setValues,
        route: `${base}['labels']['edge', 'point'][{keys}]`
      },
      {
        get: getValues,
        set: setColors,
        route: `${base}['labels']['background', 'foreground'][{keys}]`
      },
      {
        returns: `*`,
        get: getValues,
        route: `${base}['labels'].controls[{keys}]`
      },
      {
        returns: `*`,
        get: getValues,
        set: setValues,
        route: `${base}['labels'].controls[{keys}][{keys}]`
      },
      {
        get: getValues,
        route: `${base}['labels'].settings[{keys}]`
      },
      {
        get: getValues,
        route: `${base}['labels'].options[{keys}]`
      },
      {
        get: getValues,
        route: `${base}['labels'].options[{keys}][{keys}]`
      },
      {
        get: getLabelsByTypeAndIndexHandler,
        route: `${base}['labelsByType']['edge', 'point'][{integers}][
                'type', 'index', 'title', 'columns', 'importantColumns', 'globalIndex'
            ]`
      },
      {
        route: `${base}['labelsByType']['edge', 'point'][{integers}]['filters', 'exclusions']`,
        get: path => {
          const thisPath = path.slice(0, -1);
          const basePath = path.slice(0, -4);
          const lists = [].concat(path[path.length - 1]);
          return lists.map(listType =>
            $value(thisPath.concat(listType), $ref(basePath.concat(listType)))
          );
        }
      }
    ];

    function getLabelsByTypeAndIndexHandler(path) {
      const workbookIds = [].concat(path[1]);
      const viewIds = [].concat(path[3]);
      const labelKeys = [].concat(path[path.length - 1]);
      const labelTypes = [].concat(path[path.length - 3]);
      const labelIndexes = [].concat(path[path.length - 2]);
      const { request: { query: options = {} } } = this;

      return loadLabelsByIndexAndType({
        workbookIds,
        viewIds,
        labelTypes,
        labelIndexes,
        options
      }).mergeMap(({ workbook, view, label }) => {
        const { data, type, index } = label;
        const basePath = `workbooksById['${workbook.id}'].viewsById['${view.id}'].labelsByType`;
        return labelKeys.map(key =>
          $value(
            `${basePath}['${type}'][${index}]['${key}']`,
            key === 'type' ? type : key === 'index' ? index : data[key]
          )
        );
      });
    }
  };
}
