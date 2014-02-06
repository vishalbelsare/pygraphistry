define(["jQuery", "Q"], function ($, Q) {

  return {
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
    loadBinary: function (file) { // -> Promise Binary
      var t0 = new Date().getTime();

      function Binary (buf) {
        return {
          edges: new Uint32Array(buf.buffer, 4 * 4),
          min: buf[0],
          max: buf[1],
          numNodes: buf[2],
          numEdges: buf[3]
        };  
      }

      var res = Q.defer();
   
      var xhr = new XMLHttpRequest();
      xhr.open('GET', file, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = function(e) {
        res.resolve(Binary(new Uint32Array(this.response)));
        console.log('binary load', new Date().getTime() - t0, 'ms');
      };
      xhr.send(); 

      return res.promise;
    },
    load: function (file) {
      var t0 = new Date().getTime();

      return Q($.ajax(file, {dataType: "text"})).then(function (str) {

        console.log('naive parse', new Date().getTime() - t0, 'ms');
          
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
        
        console.log('naive parse + transform', new Date().getTime() - t0, 'ms');
        
        return {
          nodes: nodes,
          links: links
        };
    }); } //load
  };
});