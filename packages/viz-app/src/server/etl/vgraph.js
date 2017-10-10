'use strict';

var path = require('path');

var _ = require('underscore');
var sprintf = require('sprintf-js').sprintf;

var Log = require('@graphistry/common').logger;
var logger = Log.createLogger('etlworker:vgraph');

//TODO: Lines 60-261 instances of console should be changed to pipe output to client

import { VectorGraph } from '@graphistry/vgraph-to-mapd/lib/cjs/vgraph';
import { _isSafeNumber } from '@graphistry/falcor-path-utils/lib/toPaths.js';

var defaults = {
  double: NaN,
  integer: 0x7fffffff,
  string: '\0'
};

// String * String -> Vector
function makeVector(name, type, target) {
  var vector;

  if (type === 'double') {
    vector = new VectorGraph.DoubleAttributeVector();
    vector.dest = 'double_vectors';
    vector.transform = parseFloat;
  } else if (type === 'integer') {
    vector = new VectorGraph.Int32AttributeVector();
    vector.dest = 'int32_vectors';
    vector.transform = function(x) {
      return parseInt(x) || 0;
    };
  } else {
    vector = new VectorGraph.StringAttributeVector();
    vector.dest = 'string_vectors';
    vector.transform = function(x) {
      return String(x).trim();
    };
  }

  vector.default = defaults[type];
  vector.name = name;
  vector.target = target;
  vector.values = [];
  vector.map = {};
  return vector;
}

// JSON -> {String -> Vector}
function getAttributeVectors(header, target) {
  var map = _.map(header, function(info, key) {
    if (info.type === 'empty') {
      logger.info('Skipping attribute', key, 'because it has no data.');
      return [];
    }
    var vec = makeVector(key, info.type, target);
    return [key, vec];
  });

  return _.object(
    _.filter(map, function(x) {
      return x.length > 0;
    })
  );
}

function defined(value) {
  return (
    value !== undefined &&
    value !== null &&
    value !== '' &&
    value !== defaults.string &&
    !(typeof value === 'number' && isNaN(value))
  );
}

function inferType(samples) {
  if (samples.length === 0) {
    return 'empty';
  }
  if (
    _.all(samples, function(val) {
      return !isNaN(val);
    })
  ) {
    if (_.all(samples, _isSafeNumber)) {
      return 'integer';
    } else {
      return 'double';
    }
  } else {
    return 'string';
  }
}

function confirmType(typeName, table, key) {
  //confirm bottom, else try to raise
  let inferredType = undefined;
  if (typeName === 'empty' || !table.length) {
    let isUndefined = true;
    for (let row = 0; row < table.length; row++) {
      if (defined(table[row][key])) {
        isUndefined = false;
        inferredType = inferType([table[row][key]]);
        break;
      }
    }
    if (isUndefined) {
      return 'empty';
    }
  } else {
    inferredType = typeName;
  }

  if (inferredType === 'string') {
    for (let row = 0; row < table.length; row++) {
      const v = table[row][key];
      if (v !== undefined && v !== null) {
        if (isNaN(v)) {
          return 'string';
        }
      }
    }
    return confirmType('integer', table, key); //integer call always completes
  }

  //raise numbers if needed
  let isInteger = true;
  let isPopulated = false;
  for (let row = 0; row < table.length; row++) {
    const v = table[row][key];
    if (v !== undefined && v !== null) {
      isPopulated = true;
      if (isNaN(v)) {
        return 'string';
      }
      if (!_isSafeNumber(v)) {
        isInteger = false;
      }
    }
  }

  if (!isPopulated) {
    return 'empty';
  }

  return isInteger ? 'integer' : 'double';
}

function getHeader(table) {
  var res = {};

  var total = 0;

  _.each(table, function(row) {
    _.each(_.keys(row), function(key) {
      var data = res[key] || { count: 0, samples: [], type: undefined, key };
      var val = row[key];
      if (defined(val)) {
        data.count++;
        if (data.samples.length < 100) {
          data.samples.push(val);
        }
      }
      res[key] = data;
    });
    total++;
  });

  return _.object(
    _.map(res, function(data, name) {
      data.freq = data.count / total;
      data.type = confirmType(inferType(data.samples), table, data.key);
      return [name, data];
    })
  );
}

// Simple (and dumb) conversion of JSON edge lists to VGraph
// JSON * String * String * String -> VGraph
function fromEdgeList(elist, nlabels, srcField, dstField, idField, name) {
  nlabels = nlabels || [];

  var node2Idx = {};
  var idx2Node = {};
  var nodeCount = 0;
  var edges = [];
  // For detecting duplicate edges.
  var edgeMap = {};

  var addNode = function(node) {
    if (!node2Idx.hasOwnProperty(node)) {
      idx2Node[nodeCount] = node;
      node2Idx[node] = nodeCount;
      nodeCount++;
    }
  };

  // 'a * 'a -> bool
  // return true if dupe
  var warnsLeftNull = 100;
  var isBadEdge = function(src, dst, entry) {
    if (src === undefined || dst === undefined || src === null || dst === null) {
      if (warnsLeftNull-- > 0) {
        logger.info('Edge %s <-> %s has null field', src, dst, entry);
      }
      return true;
    }

    return false;
  };

  //return whether added
  // -> bool
  function addEdge(node0, node1) {
    var e = new VectorGraph.Edge();
    e.src = node2Idx[node0];
    e.dst = node2Idx[node1];
    edges.push(e);

    var dsts = edgeMap[node0] || {};
    dsts[node1] = true;
    edgeMap[node0] = dsts;

    return true;
  }

  function addAttributes(vectors, entry) {
    _.each(vectors, function(vector, name) {
      if (name in entry && entry[name] !== null && entry[name] !== undefined) {
        vector.values.push(vector.transform(entry[name]));
      } else {
        vector.values.push(vector.default);
      }
    });
  }

  logger.trace('Infering schema...');

  var eheader = getHeader(elist);
  logger.info('Edge Table');
  _.each(eheader, function(data, key) {
    logger.info(
      sprintf('%36s: %3d%% filled    %s', key, Math.floor(data.freq * 100).toFixed(0), data.type)
    );
  });
  var nheader = getHeader(nlabels);
  logger.info('Node Table');
  _.each(nheader, function(data, key) {
    logger.info(
      sprintf('%36s: %3d%% filled    %s', key, Math.floor(data.freq * 100).toFixed(0), data.type)
    );
  });

  if (!(srcField in eheader)) {
    logger.info('Edges have no srcField', srcField, 'header', eheader);
    return undefined;
  }
  if (!(dstField in eheader)) {
    logger.info('Edges have no dstField', dstField);
    return undefined;
  }
  if (nlabels.length > 0 && !(idField in nheader)) {
    logger.info('Nodes have no idField', idField);
    return undefined;
  }
  var evectors = getAttributeVectors(eheader, VectorGraph.AttributeTarget.EDGE);
  var nvectors = getAttributeVectors(nheader, VectorGraph.AttributeTarget.VERTEX);

  logger.trace('Loading', elist.length, 'edges...');
  _.each(elist, function(entry) {
    var node0 = entry[srcField];
    var node1 = entry[dstField];
    addNode(node0);
    addNode(node1);
    if (!isBadEdge(node0, node1, entry)) {
      //must happen after addNode
      addEdge(node0, node1);

      addAttributes(evectors, entry);
    }
  });

  logger.trace('Loading', nlabels.length, 'labels for', nodeCount, 'nodes');
  if (nodeCount > nlabels.length) {
    logger.info('There are', nodeCount - nlabels.length, 'labels missing');
  }

  //Support singletons
  for (var i = 0; i < nlabels.length; i++) {
    var label = nlabels[i];
    var nodeId = label[idField];
    if (!(nodeId in node2Idx)) {
      addNode(nodeId);
    }
  }

  var sortedLabels = new Array(nodeCount);
  var warnsLeftLabel = 100;
  for (var i = 0; i < nlabels.length; i++) {
    var label = nlabels[i];
    var nodeId = label[idField];
    if (nodeId in node2Idx) {
      var labelIdx = node2Idx[nodeId];
      sortedLabels[labelIdx] = label;
    } else {
      if (warnsLeftLabel-- > 0) {
        logger.info(
          sprintf(
            'Skipping label #%6d (nodeId: %10s) which has no matching node. (ID field: %s, label: %s)',
            i,
            nodeId,
            idField,
            JSON.stringify(label)
          )
        );
      }
    }
  }

  _.each(sortedLabels, function(entry) {
    addAttributes(nvectors, entry || {});
  });

  logger.trace('Encoding protobuf...');
  var vg = new VectorGraph();
  vg.version = 0;
  vg.name = name;
  vg.type = VectorGraph.GraphType.DIRECTED;
  vg.vertexCount = nodeCount;
  vg.edgeCount = edges.length;
  vg.edges = edges;

  _.each(_.omit(evectors, srcField, dstField), function(vector) {
    vg[vector.dest].push(vector);
  });

  _.each(_.omit(nvectors, '_mkv_child', '_timediff'), function(vector) {
    vg[vector.dest].push(vector);
  });

  return { vg, sortedLabels, unsortedEdges: edges };
}

function decodeVGraph(buffer) {
  return VectorGraph.decode(buffer);
}

export { fromEdgeList, decodeVGraph, confirmType };
