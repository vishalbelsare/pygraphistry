/*eslint-disable block-scoped-var, no-redeclare, no-control-regex, no-prototype-builtins*/
import * as $protobuf from 'protobufjs/minimal';

// Common aliases
const $Reader = $protobuf.Reader,
    $Writer = $protobuf.Writer,
    $util = $protobuf.util;

// Exported root namespace
const $root = $protobuf.roots['default'] || ($protobuf.roots['default'] = {});

export const VectorGraph = ($root.VectorGraph = (() => {
    /**
     * Properties of a VectorGraph.
     * @exports IVectorGraph
     * @interface IVectorGraph
     * @property {number} version VectorGraph version
     * @property {string} [name] VectorGraph name
     * @property {VectorGraph.GraphType} type VectorGraph type
     * @property {number} vertexCount VectorGraph vertexCount
     * @property {number} edgeCount VectorGraph edgeCount
     * @property {Array.<VectorGraph.IEdge>} [edges] VectorGraph edges
     * @property {Array.<VectorGraph.IUInt32AttributeVector>} [uint32_vectors] VectorGraph uint32_vectors
     * @property {Array.<VectorGraph.IDoubleAttributeVector>} [double_vectors] VectorGraph double_vectors
     * @property {Array.<VectorGraph.IStringAttributeVector>} [string_vectors] VectorGraph string_vectors
     * @property {Array.<VectorGraph.IInt32AttributeVector>} [int32_vectors] VectorGraph int32_vectors
     * @property {Array.<VectorGraph.IInt64AttributeVector>} [int64_vectors] VectorGraph int64_vectors
     * @property {Array.<VectorGraph.IFloatAttributeVector>} [float_vectors] VectorGraph float_vectors
     * @property {Array.<VectorGraph.IBoolAttributeVector>} [bool_vectors] VectorGraph bool_vectors
     * @property {VectorGraph.IBindings} [bindings] VectorGraph bindings
     */

    /**
     * Constructs a new VectorGraph.
     * @exports VectorGraph
     * @classdesc Represents a VectorGraph.
     * @constructor
     * @param {IVectorGraph=} [properties] Properties to set
     */
    function VectorGraph(properties) {
        this.edges = [];
        this.uint32_vectors = [];
        this.double_vectors = [];
        this.string_vectors = [];
        this.int32_vectors = [];
        this.int64_vectors = [];
        this.float_vectors = [];
        this.bool_vectors = [];
        if (properties)
            for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
    }

    /**
     * VectorGraph version.
     * @member {number}version
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.version = 0;

    /**
     * VectorGraph name.
     * @member {string}name
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.name = '';

    /**
     * VectorGraph type.
     * @member {VectorGraph.GraphType}type
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.type = 0;

    /**
     * VectorGraph vertexCount.
     * @member {number}vertexCount
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.vertexCount = 0;

    /**
     * VectorGraph edgeCount.
     * @member {number}edgeCount
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.edgeCount = 0;

    /**
     * VectorGraph edges.
     * @member {Array.<VectorGraph.IEdge>}edges
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.edges = $util.emptyArray;

    /**
     * VectorGraph uint32_vectors.
     * @member {Array.<VectorGraph.IUInt32AttributeVector>}uint32_vectors
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.uint32_vectors = $util.emptyArray;

    /**
     * VectorGraph double_vectors.
     * @member {Array.<VectorGraph.IDoubleAttributeVector>}double_vectors
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.double_vectors = $util.emptyArray;

    /**
     * VectorGraph string_vectors.
     * @member {Array.<VectorGraph.IStringAttributeVector>}string_vectors
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.string_vectors = $util.emptyArray;

    /**
     * VectorGraph int32_vectors.
     * @member {Array.<VectorGraph.IInt32AttributeVector>}int32_vectors
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.int32_vectors = $util.emptyArray;

    /**
     * VectorGraph int64_vectors.
     * @member {Array.<VectorGraph.IInt64AttributeVector>}int64_vectors
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.int64_vectors = $util.emptyArray;

    /**
     * VectorGraph float_vectors.
     * @member {Array.<VectorGraph.IFloatAttributeVector>}float_vectors
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.float_vectors = $util.emptyArray;

    /**
     * VectorGraph bool_vectors.
     * @member {Array.<VectorGraph.IBoolAttributeVector>}bool_vectors
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.bool_vectors = $util.emptyArray;

    /**
     * VectorGraph bindings.
     * @member {(VectorGraph.IBindings|null|undefined)}bindings
     * @memberof VectorGraph
     * @instance
     */
    VectorGraph.prototype.bindings = null;

    /**
     * Encodes the specified VectorGraph message. Does not implicitly {@link VectorGraph.verify|verify} messages.
     * @function encode
     * @memberof VectorGraph
     * @static
     * @param {IVectorGraph} message VectorGraph message or plain object to encode
     * @param {$protobuf.Writer} [writer] Writer to encode to
     * @returns {$protobuf.Writer} Writer
     */
    VectorGraph.encode = function encode(message, writer) {
        if (!writer) writer = $Writer.create();
        writer.uint32(/* id 1, wireType 0 =*/ 8).uint32(message.version);
        if (message.name != null && message.hasOwnProperty('name'))
            writer.uint32(/* id 2, wireType 2 =*/ 18).string(message.name);
        writer.uint32(/* id 3, wireType 0 =*/ 24).int32(message.type);
        writer.uint32(/* id 4, wireType 0 =*/ 32).uint32(message.vertexCount);
        writer.uint32(/* id 5, wireType 0 =*/ 40).uint32(message.edgeCount);
        if (message.edges != null && message.edges.length)
            for (let i = 0; i < message.edges.length; ++i)
                $root.VectorGraph.Edge
                    .encode(message.edges[i], writer.uint32(/* id 6, wireType 2 =*/ 50).fork())
                    .ldelim();
        if (message.uint32_vectors != null && message.uint32_vectors.length)
            for (let i = 0; i < message.uint32_vectors.length; ++i)
                $root.VectorGraph.UInt32AttributeVector
                    .encode(
                        message.uint32_vectors[i],
                        writer.uint32(/* id 7, wireType 2 =*/ 58).fork()
                    )
                    .ldelim();
        if (message.double_vectors != null && message.double_vectors.length)
            for (let i = 0; i < message.double_vectors.length; ++i)
                $root.VectorGraph.DoubleAttributeVector
                    .encode(
                        message.double_vectors[i],
                        writer.uint32(/* id 8, wireType 2 =*/ 66).fork()
                    )
                    .ldelim();
        if (message.string_vectors != null && message.string_vectors.length)
            for (let i = 0; i < message.string_vectors.length; ++i)
                $root.VectorGraph.StringAttributeVector
                    .encode(
                        message.string_vectors[i],
                        writer.uint32(/* id 9, wireType 2 =*/ 74).fork()
                    )
                    .ldelim();
        if (message.int32_vectors != null && message.int32_vectors.length)
            for (let i = 0; i < message.int32_vectors.length; ++i)
                $root.VectorGraph.Int32AttributeVector
                    .encode(
                        message.int32_vectors[i],
                        writer.uint32(/* id 10, wireType 2 =*/ 82).fork()
                    )
                    .ldelim();
        if (message.int64_vectors != null && message.int64_vectors.length)
            for (let i = 0; i < message.int64_vectors.length; ++i)
                $root.VectorGraph.Int64AttributeVector
                    .encode(
                        message.int64_vectors[i],
                        writer.uint32(/* id 11, wireType 2 =*/ 90).fork()
                    )
                    .ldelim();
        if (message.float_vectors != null && message.float_vectors.length)
            for (let i = 0; i < message.float_vectors.length; ++i)
                $root.VectorGraph.FloatAttributeVector
                    .encode(
                        message.float_vectors[i],
                        writer.uint32(/* id 12, wireType 2 =*/ 98).fork()
                    )
                    .ldelim();
        if (message.bool_vectors != null && message.bool_vectors.length)
            for (let i = 0; i < message.bool_vectors.length; ++i)
                $root.VectorGraph.BoolAttributeVector
                    .encode(
                        message.bool_vectors[i],
                        writer.uint32(/* id 13, wireType 2 =*/ 106).fork()
                    )
                    .ldelim();
        if (message.bindings != null && message.hasOwnProperty('bindings'))
            $root.VectorGraph.Bindings
                .encode(message.bindings, writer.uint32(/* id 14, wireType 2 =*/ 114).fork())
                .ldelim();
        return writer;
    };

    /**
     * Decodes a VectorGraph message from the specified reader or buffer.
     * @function decode
     * @memberof VectorGraph
     * @static
     * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
     * @param {number} [length] Message length if known beforehand
     * @returns {VectorGraph} VectorGraph
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    VectorGraph.decode = function decode(reader, length) {
        if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
        let end = length === undefined ? reader.len : reader.pos + length,
            message = new $root.VectorGraph();
        while (reader.pos < end) {
            let tag = reader.uint32();
            switch (tag >>> 3) {
                case 1:
                    message.version = reader.uint32();
                    break;
                case 2:
                    message.name = reader.string();
                    break;
                case 3:
                    message.type = reader.int32();
                    break;
                case 4:
                    message.vertexCount = reader.uint32();
                    break;
                case 5:
                    message.edgeCount = reader.uint32();
                    break;
                case 6:
                    if (!(message.edges && message.edges.length)) message.edges = [];
                    message.edges.push($root.VectorGraph.Edge.decode(reader, reader.uint32()));
                    break;
                case 7:
                    if (!(message.uint32_vectors && message.uint32_vectors.length))
                        message.uint32_vectors = [];
                    message.uint32_vectors.push(
                        $root.VectorGraph.UInt32AttributeVector.decode(reader, reader.uint32())
                    );
                    break;
                case 8:
                    if (!(message.double_vectors && message.double_vectors.length))
                        message.double_vectors = [];
                    message.double_vectors.push(
                        $root.VectorGraph.DoubleAttributeVector.decode(reader, reader.uint32())
                    );
                    break;
                case 9:
                    if (!(message.string_vectors && message.string_vectors.length))
                        message.string_vectors = [];
                    message.string_vectors.push(
                        $root.VectorGraph.StringAttributeVector.decode(reader, reader.uint32())
                    );
                    break;
                case 10:
                    if (!(message.int32_vectors && message.int32_vectors.length))
                        message.int32_vectors = [];
                    message.int32_vectors.push(
                        $root.VectorGraph.Int32AttributeVector.decode(reader, reader.uint32())
                    );
                    break;
                case 11:
                    if (!(message.int64_vectors && message.int64_vectors.length))
                        message.int64_vectors = [];
                    message.int64_vectors.push(
                        $root.VectorGraph.Int64AttributeVector.decode(reader, reader.uint32())
                    );
                    break;
                case 12:
                    if (!(message.float_vectors && message.float_vectors.length))
                        message.float_vectors = [];
                    message.float_vectors.push(
                        $root.VectorGraph.FloatAttributeVector.decode(reader, reader.uint32())
                    );
                    break;
                case 13:
                    if (!(message.bool_vectors && message.bool_vectors.length))
                        message.bool_vectors = [];
                    message.bool_vectors.push(
                        $root.VectorGraph.BoolAttributeVector.decode(reader, reader.uint32())
                    );
                    break;
                case 14:
                    message.bindings = $root.VectorGraph.Bindings.decode(reader, reader.uint32());
                    break;
                default:
                    reader.skipType(tag & 7);
                    break;
            }
        }
        if (!message.hasOwnProperty('version'))
            throw $util.ProtocolError("missing required 'version'", { instance: message });
        if (!message.hasOwnProperty('type'))
            throw $util.ProtocolError("missing required 'type'", { instance: message });
        if (!message.hasOwnProperty('vertexCount'))
            throw $util.ProtocolError("missing required 'vertexCount'", { instance: message });
        if (!message.hasOwnProperty('edgeCount'))
            throw $util.ProtocolError("missing required 'edgeCount'", { instance: message });
        return message;
    };

    /**
     * GraphType enum.
     * @enum {string}
     * @property {number} UNDIRECTED=0 UNDIRECTED value
     * @property {number} DIRECTED=1 DIRECTED value
     */
    VectorGraph.GraphType = (function() {
        const valuesById = {},
            values = Object.create(valuesById);
        values[(valuesById[0] = 'UNDIRECTED')] = 0;
        values[(valuesById[1] = 'DIRECTED')] = 1;
        return values;
    })();

    VectorGraph.Edge = (function() {
        /**
         * Properties of an Edge.
         * @memberof VectorGraph
         * @interface IEdge
         * @property {number} src Edge src
         * @property {number} dst Edge dst
         */

        /**
         * Constructs a new Edge.
         * @memberof VectorGraph
         * @classdesc Represents an Edge.
         * @constructor
         * @param {VectorGraph.IEdge=} [properties] Properties to set
         */
        function Edge(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * Edge src.
         * @member {number}src
         * @memberof VectorGraph.Edge
         * @instance
         */
        Edge.prototype.src = 0;

        /**
         * Edge dst.
         * @member {number}dst
         * @memberof VectorGraph.Edge
         * @instance
         */
        Edge.prototype.dst = 0;

        /**
         * Encodes the specified Edge message. Does not implicitly {@link VectorGraph.Edge.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.Edge
         * @static
         * @param {VectorGraph.IEdge} message Edge message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Edge.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            writer.uint32(/* id 1, wireType 0 =*/ 8).uint32(message.src);
            writer.uint32(/* id 2, wireType 0 =*/ 16).uint32(message.dst);
            return writer;
        };

        /**
         * Decodes an Edge message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.Edge
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.Edge} Edge
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Edge.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.Edge();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.src = reader.uint32();
                        break;
                    case 2:
                        message.dst = reader.uint32();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            if (!message.hasOwnProperty('src'))
                throw $util.ProtocolError("missing required 'src'", { instance: message });
            if (!message.hasOwnProperty('dst'))
                throw $util.ProtocolError("missing required 'dst'", { instance: message });
            return message;
        };

        return Edge;
    })();

    /**
     * AttributeTarget enum.
     * @enum {string}
     * @property {number} VERTEX=0 VERTEX value
     * @property {number} EDGE=1 EDGE value
     */
    VectorGraph.AttributeTarget = (function() {
        const valuesById = {},
            values = Object.create(valuesById);
        values[(valuesById[0] = 'VERTEX')] = 0;
        values[(valuesById[1] = 'EDGE')] = 1;
        return values;
    })();

    VectorGraph.UInt32AttributeVector = (function() {
        /**
         * Properties of a UInt32AttributeVector.
         * @memberof VectorGraph
         * @interface IUInt32AttributeVector
         * @property {string} [name] UInt32AttributeVector name
         * @property {VectorGraph.AttributeTarget} [target] UInt32AttributeVector target
         * @property {Array.<number>} [values] UInt32AttributeVector values
         * @property {string} [type] UInt32AttributeVector type
         * @property {string} [format] UInt32AttributeVector format
         */

        /**
         * Constructs a new UInt32AttributeVector.
         * @memberof VectorGraph
         * @classdesc Represents a UInt32AttributeVector.
         * @constructor
         * @param {VectorGraph.IUInt32AttributeVector=} [properties] Properties to set
         */
        function UInt32AttributeVector(properties) {
            this.values = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * UInt32AttributeVector name.
         * @member {string}name
         * @memberof VectorGraph.UInt32AttributeVector
         * @instance
         */
        UInt32AttributeVector.prototype.name = '';

        /**
         * UInt32AttributeVector target.
         * @member {VectorGraph.AttributeTarget}target
         * @memberof VectorGraph.UInt32AttributeVector
         * @instance
         */
        UInt32AttributeVector.prototype.target = 0;

        /**
         * UInt32AttributeVector values.
         * @member {Array.<number>}values
         * @memberof VectorGraph.UInt32AttributeVector
         * @instance
         */
        UInt32AttributeVector.prototype.values = $util.emptyArray;

        /**
         * UInt32AttributeVector type.
         * @member {string}type
         * @memberof VectorGraph.UInt32AttributeVector
         * @instance
         */
        UInt32AttributeVector.prototype.type = '';

        /**
         * UInt32AttributeVector format.
         * @member {string}format
         * @memberof VectorGraph.UInt32AttributeVector
         * @instance
         */
        UInt32AttributeVector.prototype.format = '';

        /**
         * Encodes the specified UInt32AttributeVector message. Does not implicitly {@link VectorGraph.UInt32AttributeVector.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.UInt32AttributeVector
         * @static
         * @param {VectorGraph.IUInt32AttributeVector} message UInt32AttributeVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        UInt32AttributeVector.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            if (message.name != null && message.hasOwnProperty('name'))
                writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
            if (message.target != null && message.hasOwnProperty('target'))
                writer.uint32(/* id 2, wireType 0 =*/ 16).int32(message.target);
            if (message.values != null && message.values.length) {
                writer.uint32(/* id 3, wireType 2 =*/ 26).fork();
                for (let i = 0; i < message.values.length; ++i) writer.uint32(message.values[i]);
                writer.ldelim();
            }
            if (message.type != null && message.hasOwnProperty('type'))
                writer.uint32(/* id 4, wireType 2 =*/ 34).string(message.type);
            if (message.format != null && message.hasOwnProperty('format'))
                writer.uint32(/* id 5, wireType 2 =*/ 42).string(message.format);
            return writer;
        };

        /**
         * Decodes a UInt32AttributeVector message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.UInt32AttributeVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.UInt32AttributeVector} UInt32AttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        UInt32AttributeVector.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.UInt32AttributeVector();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.name = reader.string();
                        break;
                    case 2:
                        message.target = reader.int32();
                        break;
                    case 3:
                        if (!(message.values && message.values.length)) message.values = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2) message.values.push(reader.uint32());
                        } else message.values.push(reader.uint32());
                        break;
                    case 4:
                        message.type = reader.string();
                        break;
                    case 5:
                        message.format = reader.string();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            return message;
        };

        return UInt32AttributeVector;
    })();

    VectorGraph.Int32AttributeVector = (function() {
        /**
         * Properties of an Int32AttributeVector.
         * @memberof VectorGraph
         * @interface IInt32AttributeVector
         * @property {string} [name] Int32AttributeVector name
         * @property {VectorGraph.AttributeTarget} [target] Int32AttributeVector target
         * @property {Array.<number>} [values] Int32AttributeVector values
         * @property {string} [type] Int32AttributeVector type
         * @property {string} [format] Int32AttributeVector format
         */

        /**
         * Constructs a new Int32AttributeVector.
         * @memberof VectorGraph
         * @classdesc Represents an Int32AttributeVector.
         * @constructor
         * @param {VectorGraph.IInt32AttributeVector=} [properties] Properties to set
         */
        function Int32AttributeVector(properties) {
            this.values = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * Int32AttributeVector name.
         * @member {string}name
         * @memberof VectorGraph.Int32AttributeVector
         * @instance
         */
        Int32AttributeVector.prototype.name = '';

        /**
         * Int32AttributeVector target.
         * @member {VectorGraph.AttributeTarget}target
         * @memberof VectorGraph.Int32AttributeVector
         * @instance
         */
        Int32AttributeVector.prototype.target = 0;

        /**
         * Int32AttributeVector values.
         * @member {Array.<number>}values
         * @memberof VectorGraph.Int32AttributeVector
         * @instance
         */
        Int32AttributeVector.prototype.values = $util.emptyArray;

        /**
         * Int32AttributeVector type.
         * @member {string}type
         * @memberof VectorGraph.Int32AttributeVector
         * @instance
         */
        Int32AttributeVector.prototype.type = '';

        /**
         * Int32AttributeVector format.
         * @member {string}format
         * @memberof VectorGraph.Int32AttributeVector
         * @instance
         */
        Int32AttributeVector.prototype.format = '';

        /**
         * Encodes the specified Int32AttributeVector message. Does not implicitly {@link VectorGraph.Int32AttributeVector.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.Int32AttributeVector
         * @static
         * @param {VectorGraph.IInt32AttributeVector} message Int32AttributeVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Int32AttributeVector.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            if (message.name != null && message.hasOwnProperty('name'))
                writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
            if (message.target != null && message.hasOwnProperty('target'))
                writer.uint32(/* id 2, wireType 0 =*/ 16).int32(message.target);
            if (message.values != null && message.values.length) {
                writer.uint32(/* id 3, wireType 2 =*/ 26).fork();
                for (let i = 0; i < message.values.length; ++i) writer.int32(message.values[i]);
                writer.ldelim();
            }
            if (message.type != null && message.hasOwnProperty('type'))
                writer.uint32(/* id 4, wireType 2 =*/ 34).string(message.type);
            if (message.format != null && message.hasOwnProperty('format'))
                writer.uint32(/* id 5, wireType 2 =*/ 42).string(message.format);
            return writer;
        };

        /**
         * Decodes an Int32AttributeVector message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.Int32AttributeVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.Int32AttributeVector} Int32AttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Int32AttributeVector.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.Int32AttributeVector();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.name = reader.string();
                        break;
                    case 2:
                        message.target = reader.int32();
                        break;
                    case 3:
                        if (!(message.values && message.values.length)) message.values = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2) message.values.push(reader.int32());
                        } else message.values.push(reader.int32());
                        break;
                    case 4:
                        message.type = reader.string();
                        break;
                    case 5:
                        message.format = reader.string();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            return message;
        };

        return Int32AttributeVector;
    })();

    VectorGraph.Int64AttributeVector = (function() {
        /**
         * Properties of an Int64AttributeVector.
         * @memberof VectorGraph
         * @interface IInt64AttributeVector
         * @property {string} [name] Int64AttributeVector name
         * @property {VectorGraph.AttributeTarget} [target] Int64AttributeVector target
         * @property {Array.<Long>} [values] Int64AttributeVector values
         * @property {string} [type] Int64AttributeVector type
         * @property {string} [format] Int64AttributeVector format
         */

        /**
         * Constructs a new Int64AttributeVector.
         * @memberof VectorGraph
         * @classdesc Represents an Int64AttributeVector.
         * @constructor
         * @param {VectorGraph.IInt64AttributeVector=} [properties] Properties to set
         */
        function Int64AttributeVector(properties) {
            this.values = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * Int64AttributeVector name.
         * @member {string}name
         * @memberof VectorGraph.Int64AttributeVector
         * @instance
         */
        Int64AttributeVector.prototype.name = '';

        /**
         * Int64AttributeVector target.
         * @member {VectorGraph.AttributeTarget}target
         * @memberof VectorGraph.Int64AttributeVector
         * @instance
         */
        Int64AttributeVector.prototype.target = 0;

        /**
         * Int64AttributeVector values.
         * @member {Array.<Long>}values
         * @memberof VectorGraph.Int64AttributeVector
         * @instance
         */
        Int64AttributeVector.prototype.values = $util.emptyArray;

        /**
         * Int64AttributeVector type.
         * @member {string}type
         * @memberof VectorGraph.Int64AttributeVector
         * @instance
         */
        Int64AttributeVector.prototype.type = '';

        /**
         * Int64AttributeVector format.
         * @member {string}format
         * @memberof VectorGraph.Int64AttributeVector
         * @instance
         */
        Int64AttributeVector.prototype.format = '';

        /**
         * Encodes the specified Int64AttributeVector message. Does not implicitly {@link VectorGraph.Int64AttributeVector.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.Int64AttributeVector
         * @static
         * @param {VectorGraph.IInt64AttributeVector} message Int64AttributeVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Int64AttributeVector.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            if (message.name != null && message.hasOwnProperty('name'))
                writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
            if (message.target != null && message.hasOwnProperty('target'))
                writer.uint32(/* id 2, wireType 0 =*/ 16).int32(message.target);
            if (message.values != null && message.values.length) {
                writer.uint32(/* id 3, wireType 2 =*/ 26).fork();
                for (let i = 0; i < message.values.length; ++i) writer.int64(message.values[i]);
                writer.ldelim();
            }
            if (message.type != null && message.hasOwnProperty('type'))
                writer.uint32(/* id 4, wireType 2 =*/ 34).string(message.type);
            if (message.format != null && message.hasOwnProperty('format'))
                writer.uint32(/* id 5, wireType 2 =*/ 42).string(message.format);
            return writer;
        };

        /**
         * Decodes an Int64AttributeVector message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.Int64AttributeVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.Int64AttributeVector} Int64AttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Int64AttributeVector.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.Int64AttributeVector();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.name = reader.string();
                        break;
                    case 2:
                        message.target = reader.int32();
                        break;
                    case 3:
                        if (!(message.values && message.values.length)) message.values = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2) message.values.push(reader.int64());
                        } else message.values.push(reader.int64());
                        break;
                    case 4:
                        message.type = reader.string();
                        break;
                    case 5:
                        message.format = reader.string();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            return message;
        };

        return Int64AttributeVector;
    })();

    VectorGraph.FloatAttributeVector = (function() {
        /**
         * Properties of a FloatAttributeVector.
         * @memberof VectorGraph
         * @interface IFloatAttributeVector
         * @property {string} [name] FloatAttributeVector name
         * @property {VectorGraph.AttributeTarget} [target] FloatAttributeVector target
         * @property {Array.<number>} [values] FloatAttributeVector values
         * @property {string} [type] FloatAttributeVector type
         * @property {string} [format] FloatAttributeVector format
         */

        /**
         * Constructs a new FloatAttributeVector.
         * @memberof VectorGraph
         * @classdesc Represents a FloatAttributeVector.
         * @constructor
         * @param {VectorGraph.IFloatAttributeVector=} [properties] Properties to set
         */
        function FloatAttributeVector(properties) {
            this.values = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * FloatAttributeVector name.
         * @member {string}name
         * @memberof VectorGraph.FloatAttributeVector
         * @instance
         */
        FloatAttributeVector.prototype.name = '';

        /**
         * FloatAttributeVector target.
         * @member {VectorGraph.AttributeTarget}target
         * @memberof VectorGraph.FloatAttributeVector
         * @instance
         */
        FloatAttributeVector.prototype.target = 0;

        /**
         * FloatAttributeVector values.
         * @member {Array.<number>}values
         * @memberof VectorGraph.FloatAttributeVector
         * @instance
         */
        FloatAttributeVector.prototype.values = $util.emptyArray;

        /**
         * FloatAttributeVector type.
         * @member {string}type
         * @memberof VectorGraph.FloatAttributeVector
         * @instance
         */
        FloatAttributeVector.prototype.type = '';

        /**
         * FloatAttributeVector format.
         * @member {string}format
         * @memberof VectorGraph.FloatAttributeVector
         * @instance
         */
        FloatAttributeVector.prototype.format = '';

        /**
         * Encodes the specified FloatAttributeVector message. Does not implicitly {@link VectorGraph.FloatAttributeVector.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.FloatAttributeVector
         * @static
         * @param {VectorGraph.IFloatAttributeVector} message FloatAttributeVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        FloatAttributeVector.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            if (message.name != null && message.hasOwnProperty('name'))
                writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
            if (message.target != null && message.hasOwnProperty('target'))
                writer.uint32(/* id 2, wireType 0 =*/ 16).int32(message.target);
            if (message.values != null && message.values.length) {
                writer.uint32(/* id 3, wireType 2 =*/ 26).fork();
                for (let i = 0; i < message.values.length; ++i) writer.float(message.values[i]);
                writer.ldelim();
            }
            if (message.type != null && message.hasOwnProperty('type'))
                writer.uint32(/* id 4, wireType 2 =*/ 34).string(message.type);
            if (message.format != null && message.hasOwnProperty('format'))
                writer.uint32(/* id 5, wireType 2 =*/ 42).string(message.format);
            return writer;
        };

        /**
         * Decodes a FloatAttributeVector message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.FloatAttributeVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.FloatAttributeVector} FloatAttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        FloatAttributeVector.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.FloatAttributeVector();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.name = reader.string();
                        break;
                    case 2:
                        message.target = reader.int32();
                        break;
                    case 3:
                        if (!(message.values && message.values.length)) message.values = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2) message.values.push(reader.float());
                        } else message.values.push(reader.float());
                        break;
                    case 4:
                        message.type = reader.string();
                        break;
                    case 5:
                        message.format = reader.string();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            return message;
        };

        return FloatAttributeVector;
    })();

    VectorGraph.DoubleAttributeVector = (function() {
        /**
         * Properties of a DoubleAttributeVector.
         * @memberof VectorGraph
         * @interface IDoubleAttributeVector
         * @property {string} [name] DoubleAttributeVector name
         * @property {VectorGraph.AttributeTarget} [target] DoubleAttributeVector target
         * @property {Array.<number>} [values] DoubleAttributeVector values
         * @property {string} [type] DoubleAttributeVector type
         * @property {string} [format] DoubleAttributeVector format
         */

        /**
         * Constructs a new DoubleAttributeVector.
         * @memberof VectorGraph
         * @classdesc Represents a DoubleAttributeVector.
         * @constructor
         * @param {VectorGraph.IDoubleAttributeVector=} [properties] Properties to set
         */
        function DoubleAttributeVector(properties) {
            this.values = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * DoubleAttributeVector name.
         * @member {string}name
         * @memberof VectorGraph.DoubleAttributeVector
         * @instance
         */
        DoubleAttributeVector.prototype.name = '';

        /**
         * DoubleAttributeVector target.
         * @member {VectorGraph.AttributeTarget}target
         * @memberof VectorGraph.DoubleAttributeVector
         * @instance
         */
        DoubleAttributeVector.prototype.target = 0;

        /**
         * DoubleAttributeVector values.
         * @member {Array.<number>}values
         * @memberof VectorGraph.DoubleAttributeVector
         * @instance
         */
        DoubleAttributeVector.prototype.values = $util.emptyArray;

        /**
         * DoubleAttributeVector type.
         * @member {string}type
         * @memberof VectorGraph.DoubleAttributeVector
         * @instance
         */
        DoubleAttributeVector.prototype.type = '';

        /**
         * DoubleAttributeVector format.
         * @member {string}format
         * @memberof VectorGraph.DoubleAttributeVector
         * @instance
         */
        DoubleAttributeVector.prototype.format = '';

        /**
         * Encodes the specified DoubleAttributeVector message. Does not implicitly {@link VectorGraph.DoubleAttributeVector.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.DoubleAttributeVector
         * @static
         * @param {VectorGraph.IDoubleAttributeVector} message DoubleAttributeVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        DoubleAttributeVector.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            if (message.name != null && message.hasOwnProperty('name'))
                writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
            if (message.target != null && message.hasOwnProperty('target'))
                writer.uint32(/* id 2, wireType 0 =*/ 16).int32(message.target);
            if (message.values != null && message.values.length) {
                writer.uint32(/* id 3, wireType 2 =*/ 26).fork();
                for (let i = 0; i < message.values.length; ++i) writer.double(message.values[i]);
                writer.ldelim();
            }
            if (message.type != null && message.hasOwnProperty('type'))
                writer.uint32(/* id 4, wireType 2 =*/ 34).string(message.type);
            if (message.format != null && message.hasOwnProperty('format'))
                writer.uint32(/* id 5, wireType 2 =*/ 42).string(message.format);
            return writer;
        };

        /**
         * Decodes a DoubleAttributeVector message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.DoubleAttributeVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.DoubleAttributeVector} DoubleAttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        DoubleAttributeVector.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.DoubleAttributeVector();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.name = reader.string();
                        break;
                    case 2:
                        message.target = reader.int32();
                        break;
                    case 3:
                        if (!(message.values && message.values.length)) message.values = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2) message.values.push(reader.double());
                        } else message.values.push(reader.double());
                        break;
                    case 4:
                        message.type = reader.string();
                        break;
                    case 5:
                        message.format = reader.string();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            return message;
        };

        return DoubleAttributeVector;
    })();

    VectorGraph.StringAttributeVector = (function() {
        /**
         * Properties of a StringAttributeVector.
         * @memberof VectorGraph
         * @interface IStringAttributeVector
         * @property {string} [name] StringAttributeVector name
         * @property {VectorGraph.AttributeTarget} [target] StringAttributeVector target
         * @property {Array.<string>} [values] StringAttributeVector values
         * @property {string} [type] StringAttributeVector type
         * @property {string} [format] StringAttributeVector format
         */

        /**
         * Constructs a new StringAttributeVector.
         * @memberof VectorGraph
         * @classdesc Represents a StringAttributeVector.
         * @constructor
         * @param {VectorGraph.IStringAttributeVector=} [properties] Properties to set
         */
        function StringAttributeVector(properties) {
            this.values = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * StringAttributeVector name.
         * @member {string}name
         * @memberof VectorGraph.StringAttributeVector
         * @instance
         */
        StringAttributeVector.prototype.name = '';

        /**
         * StringAttributeVector target.
         * @member {VectorGraph.AttributeTarget}target
         * @memberof VectorGraph.StringAttributeVector
         * @instance
         */
        StringAttributeVector.prototype.target = 0;

        /**
         * StringAttributeVector values.
         * @member {Array.<string>}values
         * @memberof VectorGraph.StringAttributeVector
         * @instance
         */
        StringAttributeVector.prototype.values = $util.emptyArray;

        /**
         * StringAttributeVector type.
         * @member {string}type
         * @memberof VectorGraph.StringAttributeVector
         * @instance
         */
        StringAttributeVector.prototype.type = '';

        /**
         * StringAttributeVector format.
         * @member {string}format
         * @memberof VectorGraph.StringAttributeVector
         * @instance
         */
        StringAttributeVector.prototype.format = '';

        /**
         * Encodes the specified StringAttributeVector message. Does not implicitly {@link VectorGraph.StringAttributeVector.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.StringAttributeVector
         * @static
         * @param {VectorGraph.IStringAttributeVector} message StringAttributeVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        StringAttributeVector.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            if (message.name != null && message.hasOwnProperty('name'))
                writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
            if (message.target != null && message.hasOwnProperty('target'))
                writer.uint32(/* id 2, wireType 0 =*/ 16).int32(message.target);
            if (message.values != null && message.values.length)
                for (let i = 0; i < message.values.length; ++i)
                    writer.uint32(/* id 3, wireType 2 =*/ 26).string(message.values[i]);
            if (message.type != null && message.hasOwnProperty('type'))
                writer.uint32(/* id 4, wireType 2 =*/ 34).string(message.type);
            if (message.format != null && message.hasOwnProperty('format'))
                writer.uint32(/* id 5, wireType 2 =*/ 42).string(message.format);
            return writer;
        };

        /**
         * Decodes a StringAttributeVector message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.StringAttributeVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.StringAttributeVector} StringAttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        StringAttributeVector.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.StringAttributeVector();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.name = reader.string();
                        break;
                    case 2:
                        message.target = reader.int32();
                        break;
                    case 3:
                        if (!(message.values && message.values.length)) message.values = [];
                        message.values.push(reader.string());
                        break;
                    case 4:
                        message.type = reader.string();
                        break;
                    case 5:
                        message.format = reader.string();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            return message;
        };

        return StringAttributeVector;
    })();

    VectorGraph.BoolAttributeVector = (function() {
        /**
         * Properties of a BoolAttributeVector.
         * @memberof VectorGraph
         * @interface IBoolAttributeVector
         * @property {string} [name] BoolAttributeVector name
         * @property {VectorGraph.AttributeTarget} [target] BoolAttributeVector target
         * @property {Array.<boolean>} [values] BoolAttributeVector values
         * @property {string} [type] BoolAttributeVector type
         * @property {string} [format] BoolAttributeVector format
         */

        /**
         * Constructs a new BoolAttributeVector.
         * @memberof VectorGraph
         * @classdesc Represents a BoolAttributeVector.
         * @constructor
         * @param {VectorGraph.IBoolAttributeVector=} [properties] Properties to set
         */
        function BoolAttributeVector(properties) {
            this.values = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * BoolAttributeVector name.
         * @member {string}name
         * @memberof VectorGraph.BoolAttributeVector
         * @instance
         */
        BoolAttributeVector.prototype.name = '';

        /**
         * BoolAttributeVector target.
         * @member {VectorGraph.AttributeTarget}target
         * @memberof VectorGraph.BoolAttributeVector
         * @instance
         */
        BoolAttributeVector.prototype.target = 0;

        /**
         * BoolAttributeVector values.
         * @member {Array.<boolean>}values
         * @memberof VectorGraph.BoolAttributeVector
         * @instance
         */
        BoolAttributeVector.prototype.values = $util.emptyArray;

        /**
         * BoolAttributeVector type.
         * @member {string}type
         * @memberof VectorGraph.BoolAttributeVector
         * @instance
         */
        BoolAttributeVector.prototype.type = '';

        /**
         * BoolAttributeVector format.
         * @member {string}format
         * @memberof VectorGraph.BoolAttributeVector
         * @instance
         */
        BoolAttributeVector.prototype.format = '';

        /**
         * Encodes the specified BoolAttributeVector message. Does not implicitly {@link VectorGraph.BoolAttributeVector.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.BoolAttributeVector
         * @static
         * @param {VectorGraph.IBoolAttributeVector} message BoolAttributeVector message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        BoolAttributeVector.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            if (message.name != null && message.hasOwnProperty('name'))
                writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
            if (message.target != null && message.hasOwnProperty('target'))
                writer.uint32(/* id 2, wireType 0 =*/ 16).int32(message.target);
            if (message.values != null && message.values.length) {
                writer.uint32(/* id 3, wireType 2 =*/ 26).fork();
                for (let i = 0; i < message.values.length; ++i) writer.bool(message.values[i]);
                writer.ldelim();
            }
            if (message.type != null && message.hasOwnProperty('type'))
                writer.uint32(/* id 4, wireType 2 =*/ 34).string(message.type);
            if (message.format != null && message.hasOwnProperty('format'))
                writer.uint32(/* id 5, wireType 2 =*/ 42).string(message.format);
            return writer;
        };

        /**
         * Decodes a BoolAttributeVector message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.BoolAttributeVector
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.BoolAttributeVector} BoolAttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        BoolAttributeVector.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.BoolAttributeVector();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.name = reader.string();
                        break;
                    case 2:
                        message.target = reader.int32();
                        break;
                    case 3:
                        if (!(message.values && message.values.length)) message.values = [];
                        if ((tag & 7) === 2) {
                            let end2 = reader.uint32() + reader.pos;
                            while (reader.pos < end2) message.values.push(reader.bool());
                        } else message.values.push(reader.bool());
                        break;
                    case 4:
                        message.type = reader.string();
                        break;
                    case 5:
                        message.format = reader.string();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            return message;
        };

        return BoolAttributeVector;
    })();

    VectorGraph.Mapping = (function() {
        /**
         * Properties of a Mapping.
         * @memberof VectorGraph
         * @interface IMapping
         * @property {string} name Mapping name
         * @property {VectorGraph.AttributeTarget} target Mapping target
         * @property {string} type Mapping type
         * @property {string} format Mapping format
         */

        /**
         * Constructs a new Mapping.
         * @memberof VectorGraph
         * @classdesc Represents a Mapping.
         * @constructor
         * @param {VectorGraph.IMapping=} [properties] Properties to set
         */
        function Mapping(properties) {
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * Mapping name.
         * @member {string}name
         * @memberof VectorGraph.Mapping
         * @instance
         */
        Mapping.prototype.name = '';

        /**
         * Mapping target.
         * @member {VectorGraph.AttributeTarget}target
         * @memberof VectorGraph.Mapping
         * @instance
         */
        Mapping.prototype.target = 0;

        /**
         * Mapping type.
         * @member {string}type
         * @memberof VectorGraph.Mapping
         * @instance
         */
        Mapping.prototype.type = '';

        /**
         * Mapping format.
         * @member {string}format
         * @memberof VectorGraph.Mapping
         * @instance
         */
        Mapping.prototype.format = '';

        /**
         * Encodes the specified Mapping message. Does not implicitly {@link VectorGraph.Mapping.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.Mapping
         * @static
         * @param {VectorGraph.IMapping} message Mapping message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Mapping.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.name);
            writer.uint32(/* id 2, wireType 0 =*/ 16).int32(message.target);
            writer.uint32(/* id 3, wireType 2 =*/ 26).string(message.type);
            writer.uint32(/* id 4, wireType 2 =*/ 34).string(message.format);
            return writer;
        };

        /**
         * Decodes a Mapping message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.Mapping
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.Mapping} Mapping
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Mapping.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.Mapping();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.name = reader.string();
                        break;
                    case 2:
                        message.target = reader.int32();
                        break;
                    case 3:
                        message.type = reader.string();
                        break;
                    case 4:
                        message.format = reader.string();
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            if (!message.hasOwnProperty('name'))
                throw $util.ProtocolError("missing required 'name'", { instance: message });
            if (!message.hasOwnProperty('target'))
                throw $util.ProtocolError("missing required 'target'", { instance: message });
            if (!message.hasOwnProperty('type'))
                throw $util.ProtocolError("missing required 'type'", { instance: message });
            if (!message.hasOwnProperty('format'))
                throw $util.ProtocolError("missing required 'format'", { instance: message });
            return message;
        };

        return Mapping;
    })();

    VectorGraph.Bindings = (function() {
        /**
         * Properties of a Bindings.
         * @memberof VectorGraph
         * @interface IBindings
         * @property {string} [idField] Bindings idField
         * @property {string} [sourceField] Bindings sourceField
         * @property {string} [destinationField] Bindings destinationField
         * @property {Array.<VectorGraph.IMapping>} [mappings] Bindings mappings
         */

        /**
         * Constructs a new Bindings.
         * @memberof VectorGraph
         * @classdesc Represents a Bindings.
         * @constructor
         * @param {VectorGraph.IBindings=} [properties] Properties to set
         */
        function Bindings(properties) {
            this.mappings = [];
            if (properties)
                for (let keys = Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null) this[keys[i]] = properties[keys[i]];
        }

        /**
         * Bindings idField.
         * @member {string}idField
         * @memberof VectorGraph.Bindings
         * @instance
         */
        Bindings.prototype.idField = '';

        /**
         * Bindings sourceField.
         * @member {string}sourceField
         * @memberof VectorGraph.Bindings
         * @instance
         */
        Bindings.prototype.sourceField = '';

        /**
         * Bindings destinationField.
         * @member {string}destinationField
         * @memberof VectorGraph.Bindings
         * @instance
         */
        Bindings.prototype.destinationField = '';

        /**
         * Bindings mappings.
         * @member {Array.<VectorGraph.IMapping>}mappings
         * @memberof VectorGraph.Bindings
         * @instance
         */
        Bindings.prototype.mappings = $util.emptyArray;

        /**
         * Encodes the specified Bindings message. Does not implicitly {@link VectorGraph.Bindings.verify|verify} messages.
         * @function encode
         * @memberof VectorGraph.Bindings
         * @static
         * @param {VectorGraph.IBindings} message Bindings message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Bindings.encode = function encode(message, writer) {
            if (!writer) writer = $Writer.create();
            if (message.idField != null && message.hasOwnProperty('idField'))
                writer.uint32(/* id 1, wireType 2 =*/ 10).string(message.idField);
            if (message.sourceField != null && message.hasOwnProperty('sourceField'))
                writer.uint32(/* id 2, wireType 2 =*/ 18).string(message.sourceField);
            if (message.destinationField != null && message.hasOwnProperty('destinationField'))
                writer.uint32(/* id 3, wireType 2 =*/ 26).string(message.destinationField);
            if (message.mappings != null && message.mappings.length)
                for (let i = 0; i < message.mappings.length; ++i)
                    $root.VectorGraph.Mapping
                        .encode(
                            message.mappings[i],
                            writer.uint32(/* id 4, wireType 2 =*/ 34).fork()
                        )
                        .ldelim();
            return writer;
        };

        /**
         * Decodes a Bindings message from the specified reader or buffer.
         * @function decode
         * @memberof VectorGraph.Bindings
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {VectorGraph.Bindings} Bindings
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Bindings.decode = function decode(reader, length) {
            if (!(reader instanceof $Reader)) reader = $Reader.create(reader);
            let end = length === undefined ? reader.len : reader.pos + length,
                message = new $root.VectorGraph.Bindings();
            while (reader.pos < end) {
                let tag = reader.uint32();
                switch (tag >>> 3) {
                    case 1:
                        message.idField = reader.string();
                        break;
                    case 2:
                        message.sourceField = reader.string();
                        break;
                    case 3:
                        message.destinationField = reader.string();
                        break;
                    case 4:
                        if (!(message.mappings && message.mappings.length)) message.mappings = [];
                        message.mappings.push(
                            $root.VectorGraph.Mapping.decode(reader, reader.uint32())
                        );
                        break;
                    default:
                        reader.skipType(tag & 7);
                        break;
                }
            }
            return message;
        };

        return Bindings;
    })();

    return VectorGraph;
})());

export { $root as default };
