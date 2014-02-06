define(["jQuery", "Q"], function ($, Q) {

  return {
    // () -> P [ Str ]
    ls: function (matrixJson) {
      //FIXME do not do as eval
      var parts = matrixJson.split('/');
      parts.pop();
      var base = parts.join('/') + '/';
            
      return Q($.ajax(matrixJson, {dataType: "text"}))
        .then(eval)
        .then(function (lst) {
          return lst.map(function (f) { 
            return {KB: f.KB, 'f': base + f.f};
          });
        });
    },
    load: function (file) {
      return Q($.ajax(file, {dataType: "text"})).then(function (str) {
        //http://bl.ocks.org/mbostock/2846454
        var nodes = [];    
        var links = str
          .split(/\n/g) // split lines
          .filter(function(d) { return d.charAt(0) != "%"; }) // skip comments
          .slice(1, -1) // skip header line, last line
          .map(function(d) {
            d = d.split(/\s+/g);
            var source = d[0] - 1, target = d[1] - 1;
            return {
                source: nodes[source] || (nodes[source] = {index: source}),
                target: nodes[target] || (nodes[target] = {index: target})
            };
        });    
        return {
          nodes: nodes,
          links: links
        };
    }); } //load
  };
});