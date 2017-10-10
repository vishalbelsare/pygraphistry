'use strict'; // code generated by pbf v3.0.5

// VectorGraph ========================================

var VectorGraph = (exports.VectorGraph = {});

VectorGraph.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph._readField,
    {
      version: 0,
      name: '',
      type: 0,
      vertexCount: 0,
      edgeCount: 0,
      edges: [],
      uint32_vectors: [],
      double_vectors: [],
      string_vectors: [],
      int32_vectors: [],
      int64_vectors: [],
      float_vectors: [],
      bool_vectors: [],
      bindings: null
    },
    end
  );
};
VectorGraph._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.version = pbf.readVarint();
  else if (tag === 2) obj.name = pbf.readString();
  else if (tag === 3) obj.type = pbf.readVarint();
  else if (tag === 4) obj.vertexCount = pbf.readVarint();
  else if (tag === 5) obj.edgeCount = pbf.readVarint();
  else if (tag === 6) obj.edges.push(VectorGraph.Edge.read(pbf, pbf.readVarint() + pbf.pos));
  else if (tag === 7)
    obj.uint32_vectors.push(
      VectorGraph.UInt32AttributeVector.read(pbf, pbf.readVarint() + pbf.pos)
    );
  else if (tag === 8)
    obj.double_vectors.push(
      VectorGraph.DoubleAttributeVector.read(pbf, pbf.readVarint() + pbf.pos)
    );
  else if (tag === 9)
    obj.string_vectors.push(
      VectorGraph.StringAttributeVector.read(pbf, pbf.readVarint() + pbf.pos)
    );
  else if (tag === 10)
    obj.int32_vectors.push(VectorGraph.Int32AttributeVector.read(pbf, pbf.readVarint() + pbf.pos));
  else if (tag === 11)
    obj.int64_vectors.push(VectorGraph.Int64AttributeVector.read(pbf, pbf.readVarint() + pbf.pos));
  else if (tag === 12)
    obj.float_vectors.push(VectorGraph.FloatAttributeVector.read(pbf, pbf.readVarint() + pbf.pos));
  else if (tag === 13)
    obj.bool_vectors.push(VectorGraph.BoolAttributeVector.read(pbf, pbf.readVarint() + pbf.pos));
  else if (tag === 14) obj.bindings = VectorGraph.Bindings.read(pbf, pbf.readVarint() + pbf.pos);
};
VectorGraph.write = function(obj, pbf) {
  if (obj.version) pbf.writeVarintField(1, obj.version);
  if (obj.name) pbf.writeStringField(2, obj.name);
  if (obj.type) pbf.writeVarintField(3, obj.type);
  if (obj.vertexCount) pbf.writeVarintField(4, obj.vertexCount);
  if (obj.edgeCount) pbf.writeVarintField(5, obj.edgeCount);
  if (obj.edges)
    for (var i = 0; i < obj.edges.length; i++)
      pbf.writeMessage(6, VectorGraph.Edge.write, obj.edges[i]);
  if (obj.uint32_vectors)
    for (i = 0; i < obj.uint32_vectors.length; i++)
      pbf.writeMessage(7, VectorGraph.UInt32AttributeVector.write, obj.uint32_vectors[i]);
  if (obj.double_vectors)
    for (i = 0; i < obj.double_vectors.length; i++)
      pbf.writeMessage(8, VectorGraph.DoubleAttributeVector.write, obj.double_vectors[i]);
  if (obj.string_vectors)
    for (i = 0; i < obj.string_vectors.length; i++)
      pbf.writeMessage(9, VectorGraph.StringAttributeVector.write, obj.string_vectors[i]);
  if (obj.int32_vectors)
    for (i = 0; i < obj.int32_vectors.length; i++)
      pbf.writeMessage(10, VectorGraph.Int32AttributeVector.write, obj.int32_vectors[i]);
  if (obj.int64_vectors)
    for (i = 0; i < obj.int64_vectors.length; i++)
      pbf.writeMessage(11, VectorGraph.Int64AttributeVector.write, obj.int64_vectors[i]);
  if (obj.float_vectors)
    for (i = 0; i < obj.float_vectors.length; i++)
      pbf.writeMessage(12, VectorGraph.FloatAttributeVector.write, obj.float_vectors[i]);
  if (obj.bool_vectors)
    for (i = 0; i < obj.bool_vectors.length; i++)
      pbf.writeMessage(13, VectorGraph.BoolAttributeVector.write, obj.bool_vectors[i]);
  if (obj.bindings) pbf.writeMessage(14, VectorGraph.Bindings.write, obj.bindings);
};

VectorGraph.GraphType = {
  UNDIRECTED: 0,
  DIRECTED: 1
};

VectorGraph.AttributeTarget = {
  VERTEX: 0,
  EDGE: 1
};

// VectorGraph.Edge ========================================

VectorGraph.Edge = {};

VectorGraph.Edge.read = function(pbf, end) {
  return pbf.readFields(VectorGraph.Edge._readField, { src: 0, dst: 0 }, end);
};
VectorGraph.Edge._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.src = pbf.readVarint();
  else if (tag === 2) obj.dst = pbf.readVarint();
};
VectorGraph.Edge.write = function(obj, pbf) {
  if (obj.src) pbf.writeVarintField(1, obj.src);
  if (obj.dst) pbf.writeVarintField(2, obj.dst);
};

// VectorGraph.UInt32AttributeVector ========================================

VectorGraph.UInt32AttributeVector = {};

VectorGraph.UInt32AttributeVector.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.UInt32AttributeVector._readField,
    { name: '', target: 0, values: [], type: '', format: '' },
    end
  );
};
VectorGraph.UInt32AttributeVector._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.name = pbf.readString();
  else if (tag === 2) obj.target = pbf.readVarint();
  else if (tag === 3) pbf.readPackedVarint(obj.values);
  else if (tag === 4) obj.type = pbf.readString();
  else if (tag === 5) obj.format = pbf.readString();
};
VectorGraph.UInt32AttributeVector.write = function(obj, pbf) {
  if (obj.name) pbf.writeStringField(1, obj.name);
  if (obj.target) pbf.writeVarintField(2, obj.target);
  if (obj.values) pbf.writePackedVarint(3, obj.values);
  if (obj.type) pbf.writeStringField(4, obj.type);
  if (obj.format) pbf.writeStringField(5, obj.format);
};

// VectorGraph.Int32AttributeVector ========================================

VectorGraph.Int32AttributeVector = {};

VectorGraph.Int32AttributeVector.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.Int32AttributeVector._readField,
    { name: '', target: 0, values: [], type: '', format: '' },
    end
  );
};
VectorGraph.Int32AttributeVector._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.name = pbf.readString();
  else if (tag === 2) obj.target = pbf.readVarint();
  else if (tag === 3) pbf.readPackedVarint(obj.values, true);
  else if (tag === 4) obj.type = pbf.readString();
  else if (tag === 5) obj.format = pbf.readString();
};
VectorGraph.Int32AttributeVector.write = function(obj, pbf) {
  if (obj.name) pbf.writeStringField(1, obj.name);
  if (obj.target) pbf.writeVarintField(2, obj.target);
  if (obj.values) pbf.writePackedVarint(3, obj.values);
  if (obj.type) pbf.writeStringField(4, obj.type);
  if (obj.format) pbf.writeStringField(5, obj.format);
};

// VectorGraph.Int64AttributeVector ========================================

VectorGraph.Int64AttributeVector = {};

VectorGraph.Int64AttributeVector.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.Int64AttributeVector._readField,
    { name: '', target: 0, values: [], type: '', format: '' },
    end
  );
};
VectorGraph.Int64AttributeVector._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.name = pbf.readString();
  else if (tag === 2) obj.target = pbf.readVarint();
  else if (tag === 3) pbf.readPackedVarint(obj.values, true);
  else if (tag === 4) obj.type = pbf.readString();
  else if (tag === 5) obj.format = pbf.readString();
};
VectorGraph.Int64AttributeVector.write = function(obj, pbf) {
  if (obj.name) pbf.writeStringField(1, obj.name);
  if (obj.target) pbf.writeVarintField(2, obj.target);
  if (obj.values) pbf.writePackedVarint(3, obj.values);
  if (obj.type) pbf.writeStringField(4, obj.type);
  if (obj.format) pbf.writeStringField(5, obj.format);
};

// VectorGraph.FloatAttributeVector ========================================

VectorGraph.FloatAttributeVector = {};

VectorGraph.FloatAttributeVector.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.FloatAttributeVector._readField,
    { name: '', target: 0, values: [], type: '', format: '' },
    end
  );
};
VectorGraph.FloatAttributeVector._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.name = pbf.readString();
  else if (tag === 2) obj.target = pbf.readVarint();
  else if (tag === 3) pbf.readPackedFloat(obj.values);
  else if (tag === 4) obj.type = pbf.readString();
  else if (tag === 5) obj.format = pbf.readString();
};
VectorGraph.FloatAttributeVector.write = function(obj, pbf) {
  if (obj.name) pbf.writeStringField(1, obj.name);
  if (obj.target) pbf.writeVarintField(2, obj.target);
  if (obj.values) pbf.writePackedFloat(3, obj.values);
  if (obj.type) pbf.writeStringField(4, obj.type);
  if (obj.format) pbf.writeStringField(5, obj.format);
};

// VectorGraph.DoubleAttributeVector ========================================

VectorGraph.DoubleAttributeVector = {};

VectorGraph.DoubleAttributeVector.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.DoubleAttributeVector._readField,
    { name: '', target: 0, values: [], type: '', format: '' },
    end
  );
};
VectorGraph.DoubleAttributeVector._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.name = pbf.readString();
  else if (tag === 2) obj.target = pbf.readVarint();
  else if (tag === 3) pbf.readPackedDouble(obj.values);
  else if (tag === 4) obj.type = pbf.readString();
  else if (tag === 5) obj.format = pbf.readString();
};
VectorGraph.DoubleAttributeVector.write = function(obj, pbf) {
  if (obj.name) pbf.writeStringField(1, obj.name);
  if (obj.target) pbf.writeVarintField(2, obj.target);
  if (obj.values) pbf.writePackedDouble(3, obj.values);
  if (obj.type) pbf.writeStringField(4, obj.type);
  if (obj.format) pbf.writeStringField(5, obj.format);
};

// VectorGraph.StringAttributeVector ========================================

VectorGraph.StringAttributeVector = {};

VectorGraph.StringAttributeVector.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.StringAttributeVector._readField,
    { name: '', target: 0, values: [], type: '', format: '' },
    end
  );
};
VectorGraph.StringAttributeVector._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.name = pbf.readString();
  else if (tag === 2) obj.target = pbf.readVarint();
  else if (tag === 3) obj.values.push(pbf.readString());
  else if (tag === 4) obj.type = pbf.readString();
  else if (tag === 5) obj.format = pbf.readString();
};
VectorGraph.StringAttributeVector.write = function(obj, pbf) {
  if (obj.name) pbf.writeStringField(1, obj.name);
  if (obj.target) pbf.writeVarintField(2, obj.target);
  if (obj.values)
    for (var i = 0; i < obj.values.length; i++) pbf.writeStringField(3, obj.values[i]);
  if (obj.type) pbf.writeStringField(4, obj.type);
  if (obj.format) pbf.writeStringField(5, obj.format);
};

// VectorGraph.BoolAttributeVector ========================================

VectorGraph.BoolAttributeVector = {};

VectorGraph.BoolAttributeVector.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.BoolAttributeVector._readField,
    { name: '', target: 0, values: [], type: '', format: '' },
    end
  );
};
VectorGraph.BoolAttributeVector._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.name = pbf.readString();
  else if (tag === 2) obj.target = pbf.readVarint();
  else if (tag === 3) pbf.readPackedBoolean(obj.values);
  else if (tag === 4) obj.type = pbf.readString();
  else if (tag === 5) obj.format = pbf.readString();
};
VectorGraph.BoolAttributeVector.write = function(obj, pbf) {
  if (obj.name) pbf.writeStringField(1, obj.name);
  if (obj.target) pbf.writeVarintField(2, obj.target);
  if (obj.values) pbf.writePackedBoolean(3, obj.values);
  if (obj.type) pbf.writeStringField(4, obj.type);
  if (obj.format) pbf.writeStringField(5, obj.format);
};

// VectorGraph.Mapping ========================================

VectorGraph.Mapping = {};

VectorGraph.Mapping.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.Mapping._readField,
    { name: '', target: 0, type: '', format: '' },
    end
  );
};
VectorGraph.Mapping._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.name = pbf.readString();
  else if (tag === 2) obj.target = pbf.readVarint();
  else if (tag === 3) obj.type = pbf.readString();
  else if (tag === 4) obj.format = pbf.readString();
};
VectorGraph.Mapping.write = function(obj, pbf) {
  if (obj.name) pbf.writeStringField(1, obj.name);
  if (obj.target) pbf.writeVarintField(2, obj.target);
  if (obj.type) pbf.writeStringField(3, obj.type);
  if (obj.format) pbf.writeStringField(4, obj.format);
};

// VectorGraph.Bindings ========================================

VectorGraph.Bindings = {};

VectorGraph.Bindings.read = function(pbf, end) {
  return pbf.readFields(
    VectorGraph.Bindings._readField,
    { idField: '', sourceField: '', destinationField: '', mappings: [] },
    end
  );
};
VectorGraph.Bindings._readField = function(tag, obj, pbf) {
  if (tag === 1) obj.idField = pbf.readString();
  else if (tag === 2) obj.sourceField = pbf.readString();
  else if (tag === 3) obj.destinationField = pbf.readString();
  else if (tag === 4) obj.mappings.push(VectorGraph.Mapping.read(pbf, pbf.readVarint() + pbf.pos));
};
VectorGraph.Bindings.write = function(obj, pbf) {
  if (obj.idField) pbf.writeStringField(1, obj.idField);
  if (obj.sourceField) pbf.writeStringField(2, obj.sourceField);
  if (obj.destinationField) pbf.writeStringField(3, obj.destinationField);
  if (obj.mappings)
    for (var i = 0; i < obj.mappings.length; i++)
      pbf.writeMessage(4, VectorGraph.Mapping.write, obj.mappings[i]);
};