import * as $protobuf from 'protobufjs';

/** Properties of a VectorGraph. */
export interface IVectorGraph {
    /** VectorGraph version */
    version: number;

    /** VectorGraph name */
    name?: string;

    /** VectorGraph type */
    type: VectorGraph.GraphType;

    /** VectorGraph vertexCount */
    vertexCount: number;

    /** VectorGraph edgeCount */
    edgeCount: number;

    /** VectorGraph edges */
    edges?: VectorGraph.IEdge[];

    /** VectorGraph uint32_vectors */
    uint32_vectors?: VectorGraph.IUInt32AttributeVector[];

    /** VectorGraph double_vectors */
    double_vectors?: VectorGraph.IDoubleAttributeVector[];

    /** VectorGraph string_vectors */
    string_vectors?: VectorGraph.IStringAttributeVector[];

    /** VectorGraph int32_vectors */
    int32_vectors?: VectorGraph.IInt32AttributeVector[];

    /** VectorGraph int64_vectors */
    int64_vectors?: VectorGraph.IInt64AttributeVector[];

    /** VectorGraph float_vectors */
    float_vectors?: VectorGraph.IFloatAttributeVector[];

    /** VectorGraph bool_vectors */
    bool_vectors?: VectorGraph.IBoolAttributeVector[];

    /** VectorGraph bindings */
    bindings?: VectorGraph.IBindings;
}

/** Represents a VectorGraph. */
export class VectorGraph {
    /**
     * Constructs a new VectorGraph.
     * @param [properties] Properties to set
     */
    constructor(properties?: IVectorGraph);

    /** VectorGraph version. */
    public version: number;

    /** VectorGraph name. */
    public name: string;

    /** VectorGraph type. */
    public type: VectorGraph.GraphType;

    /** VectorGraph vertexCount. */
    public vertexCount: number;

    /** VectorGraph edgeCount. */
    public edgeCount: number;

    /** VectorGraph edges. */
    public edges: VectorGraph.IEdge[];

    /** VectorGraph uint32_vectors. */
    public uint32_vectors: VectorGraph.IUInt32AttributeVector[];

    /** VectorGraph double_vectors. */
    public double_vectors: VectorGraph.IDoubleAttributeVector[];

    /** VectorGraph string_vectors. */
    public string_vectors: VectorGraph.IStringAttributeVector[];

    /** VectorGraph int32_vectors. */
    public int32_vectors: VectorGraph.IInt32AttributeVector[];

    /** VectorGraph int64_vectors. */
    public int64_vectors: VectorGraph.IInt64AttributeVector[];

    /** VectorGraph float_vectors. */
    public float_vectors: VectorGraph.IFloatAttributeVector[];

    /** VectorGraph bool_vectors. */
    public bool_vectors: VectorGraph.IBoolAttributeVector[];

    /** VectorGraph bindings. */
    public bindings?: VectorGraph.IBindings | null;

    /**
     * Encodes the specified VectorGraph message. Does not implicitly {@link VectorGraph.verify|verify} messages.
     * @param message VectorGraph message or plain object to encode
     * @param [writer] Writer to encode to
     * @returns Writer
     */
    public static encode(message: IVectorGraph, writer?: $protobuf.Writer): $protobuf.Writer;

    /**
     * Decodes a VectorGraph message from the specified reader or buffer.
     * @param reader Reader or buffer to decode from
     * @param [length] Message length if known beforehand
     * @returns VectorGraph
     * @throws {Error} If the payload is not a reader or valid buffer
     * @throws {$protobuf.util.ProtocolError} If required fields are missing
     */
    public static decode(reader: $protobuf.Reader | Uint8Array, length?: number): VectorGraph;
}

export namespace VectorGraph {
    enum GraphType {
        UNDIRECTED,
        DIRECTED
    }

    enum AttributeTarget {
        VERTEX,
        EDGE
    }

    /** Properties of an Edge. */
    interface IEdge {
        /** Edge src */
        src: number;

        /** Edge dst */
        dst: number;
    }

    /** Represents an Edge. */
    class Edge {
        /**
         * Constructs a new Edge.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IEdge);

        /** Edge src. */
        public src: number;

        /** Edge dst. */
        public dst: number;

        /**
         * Encodes the specified Edge message. Does not implicitly {@link VectorGraph.Edge.verify|verify} messages.
         * @param message Edge message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IEdge,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes an Edge message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Edge
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.Edge;
    }

    /** Properties of a UInt32AttributeVector. */
    interface IUInt32AttributeVector {
        /** UInt32AttributeVector name */
        name?: string;

        /** UInt32AttributeVector target */
        target?: VectorGraph.AttributeTarget;

        /** UInt32AttributeVector values */
        values?: number[];

        /** UInt32AttributeVector type */
        type?: string;

        /** UInt32AttributeVector format */
        format?: string;
    }

    /** Represents a UInt32AttributeVector. */
    class UInt32AttributeVector {
        /**
         * Constructs a new UInt32AttributeVector.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IUInt32AttributeVector);

        /** UInt32AttributeVector name. */
        public name: string;

        /** UInt32AttributeVector target. */
        public target: VectorGraph.AttributeTarget;

        /** UInt32AttributeVector values. */
        public values: number[];

        /** UInt32AttributeVector type. */
        public type: string;

        /** UInt32AttributeVector format. */
        public format: string;

        /**
         * Encodes the specified UInt32AttributeVector message. Does not implicitly {@link VectorGraph.UInt32AttributeVector.verify|verify} messages.
         * @param message UInt32AttributeVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IUInt32AttributeVector,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a UInt32AttributeVector message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns UInt32AttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.UInt32AttributeVector;
    }

    /** Properties of an Int32AttributeVector. */
    interface IInt32AttributeVector {
        /** Int32AttributeVector name */
        name?: string;

        /** Int32AttributeVector target */
        target?: VectorGraph.AttributeTarget;

        /** Int32AttributeVector values */
        values?: number[];

        /** Int32AttributeVector type */
        type?: string;

        /** Int32AttributeVector format */
        format?: string;
    }

    /** Represents an Int32AttributeVector. */
    class Int32AttributeVector {
        /**
         * Constructs a new Int32AttributeVector.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IInt32AttributeVector);

        /** Int32AttributeVector name. */
        public name: string;

        /** Int32AttributeVector target. */
        public target: VectorGraph.AttributeTarget;

        /** Int32AttributeVector values. */
        public values: number[];

        /** Int32AttributeVector type. */
        public type: string;

        /** Int32AttributeVector format. */
        public format: string;

        /**
         * Encodes the specified Int32AttributeVector message. Does not implicitly {@link VectorGraph.Int32AttributeVector.verify|verify} messages.
         * @param message Int32AttributeVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IInt32AttributeVector,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes an Int32AttributeVector message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Int32AttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.Int32AttributeVector;
    }

    /** Properties of an Int64AttributeVector. */
    interface IInt64AttributeVector {
        /** Int64AttributeVector name */
        name?: string;

        /** Int64AttributeVector target */
        target?: VectorGraph.AttributeTarget;

        /** Int64AttributeVector values */
        values?: Long[];

        /** Int64AttributeVector type */
        type?: string;

        /** Int64AttributeVector format */
        format?: string;
    }

    /** Represents an Int64AttributeVector. */
    class Int64AttributeVector {
        /**
         * Constructs a new Int64AttributeVector.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IInt64AttributeVector);

        /** Int64AttributeVector name. */
        public name: string;

        /** Int64AttributeVector target. */
        public target: VectorGraph.AttributeTarget;

        /** Int64AttributeVector values. */
        public values: Long[];

        /** Int64AttributeVector type. */
        public type: string;

        /** Int64AttributeVector format. */
        public format: string;

        /**
         * Encodes the specified Int64AttributeVector message. Does not implicitly {@link VectorGraph.Int64AttributeVector.verify|verify} messages.
         * @param message Int64AttributeVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IInt64AttributeVector,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes an Int64AttributeVector message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Int64AttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.Int64AttributeVector;
    }

    /** Properties of a FloatAttributeVector. */
    interface IFloatAttributeVector {
        /** FloatAttributeVector name */
        name?: string;

        /** FloatAttributeVector target */
        target?: VectorGraph.AttributeTarget;

        /** FloatAttributeVector values */
        values?: number[];

        /** FloatAttributeVector type */
        type?: string;

        /** FloatAttributeVector format */
        format?: string;
    }

    /** Represents a FloatAttributeVector. */
    class FloatAttributeVector {
        /**
         * Constructs a new FloatAttributeVector.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IFloatAttributeVector);

        /** FloatAttributeVector name. */
        public name: string;

        /** FloatAttributeVector target. */
        public target: VectorGraph.AttributeTarget;

        /** FloatAttributeVector values. */
        public values: number[];

        /** FloatAttributeVector type. */
        public type: string;

        /** FloatAttributeVector format. */
        public format: string;

        /**
         * Encodes the specified FloatAttributeVector message. Does not implicitly {@link VectorGraph.FloatAttributeVector.verify|verify} messages.
         * @param message FloatAttributeVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IFloatAttributeVector,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a FloatAttributeVector message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns FloatAttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.FloatAttributeVector;
    }

    /** Properties of a DoubleAttributeVector. */
    interface IDoubleAttributeVector {
        /** DoubleAttributeVector name */
        name?: string;

        /** DoubleAttributeVector target */
        target?: VectorGraph.AttributeTarget;

        /** DoubleAttributeVector values */
        values?: number[];

        /** DoubleAttributeVector type */
        type?: string;

        /** DoubleAttributeVector format */
        format?: string;
    }

    /** Represents a DoubleAttributeVector. */
    class DoubleAttributeVector {
        /**
         * Constructs a new DoubleAttributeVector.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IDoubleAttributeVector);

        /** DoubleAttributeVector name. */
        public name: string;

        /** DoubleAttributeVector target. */
        public target: VectorGraph.AttributeTarget;

        /** DoubleAttributeVector values. */
        public values: number[];

        /** DoubleAttributeVector type. */
        public type: string;

        /** DoubleAttributeVector format. */
        public format: string;

        /**
         * Encodes the specified DoubleAttributeVector message. Does not implicitly {@link VectorGraph.DoubleAttributeVector.verify|verify} messages.
         * @param message DoubleAttributeVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IDoubleAttributeVector,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a DoubleAttributeVector message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns DoubleAttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.DoubleAttributeVector;
    }

    /** Properties of a StringAttributeVector. */
    interface IStringAttributeVector {
        /** StringAttributeVector name */
        name?: string;

        /** StringAttributeVector target */
        target?: VectorGraph.AttributeTarget;

        /** StringAttributeVector values */
        values?: string[];

        /** StringAttributeVector type */
        type?: string;

        /** StringAttributeVector format */
        format?: string;
    }

    /** Represents a StringAttributeVector. */
    class StringAttributeVector {
        /**
         * Constructs a new StringAttributeVector.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IStringAttributeVector);

        /** StringAttributeVector name. */
        public name: string;

        /** StringAttributeVector target. */
        public target: VectorGraph.AttributeTarget;

        /** StringAttributeVector values. */
        public values: string[];

        /** StringAttributeVector type. */
        public type: string;

        /** StringAttributeVector format. */
        public format: string;

        /**
         * Encodes the specified StringAttributeVector message. Does not implicitly {@link VectorGraph.StringAttributeVector.verify|verify} messages.
         * @param message StringAttributeVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IStringAttributeVector,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a StringAttributeVector message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns StringAttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.StringAttributeVector;
    }

    /** Properties of a BoolAttributeVector. */
    interface IBoolAttributeVector {
        /** BoolAttributeVector name */
        name?: string;

        /** BoolAttributeVector target */
        target?: VectorGraph.AttributeTarget;

        /** BoolAttributeVector values */
        values?: boolean[];

        /** BoolAttributeVector type */
        type?: string;

        /** BoolAttributeVector format */
        format?: string;
    }

    /** Represents a BoolAttributeVector. */
    class BoolAttributeVector {
        /**
         * Constructs a new BoolAttributeVector.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IBoolAttributeVector);

        /** BoolAttributeVector name. */
        public name: string;

        /** BoolAttributeVector target. */
        public target: VectorGraph.AttributeTarget;

        /** BoolAttributeVector values. */
        public values: boolean[];

        /** BoolAttributeVector type. */
        public type: string;

        /** BoolAttributeVector format. */
        public format: string;

        /**
         * Encodes the specified BoolAttributeVector message. Does not implicitly {@link VectorGraph.BoolAttributeVector.verify|verify} messages.
         * @param message BoolAttributeVector message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IBoolAttributeVector,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a BoolAttributeVector message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns BoolAttributeVector
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.BoolAttributeVector;
    }

    /** Properties of a Mapping. */
    interface IMapping {
        /** Mapping name */
        name: string;

        /** Mapping target */
        target: VectorGraph.AttributeTarget;

        /** Mapping type */
        type: string;

        /** Mapping format */
        format: string;
    }

    /** Represents a Mapping. */
    class Mapping {
        /**
         * Constructs a new Mapping.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IMapping);

        /** Mapping name. */
        public name: string;

        /** Mapping target. */
        public target: VectorGraph.AttributeTarget;

        /** Mapping type. */
        public type: string;

        /** Mapping format. */
        public format: string;

        /**
         * Encodes the specified Mapping message. Does not implicitly {@link VectorGraph.Mapping.verify|verify} messages.
         * @param message Mapping message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IMapping,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a Mapping message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Mapping
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.Mapping;
    }

    /** Properties of a Bindings. */
    interface IBindings {
        /** Bindings idField */
        idField?: string;

        /** Bindings sourceField */
        sourceField?: string;

        /** Bindings destinationField */
        destinationField?: string;

        /** Bindings mappings */
        mappings?: VectorGraph.IMapping[];
    }

    /** Represents a Bindings. */
    class Bindings {
        /**
         * Constructs a new Bindings.
         * @param [properties] Properties to set
         */
        constructor(properties?: VectorGraph.IBindings);

        /** Bindings idField. */
        public idField: string;

        /** Bindings sourceField. */
        public sourceField: string;

        /** Bindings destinationField. */
        public destinationField: string;

        /** Bindings mappings. */
        public mappings: VectorGraph.IMapping[];

        /**
         * Encodes the specified Bindings message. Does not implicitly {@link VectorGraph.Bindings.verify|verify} messages.
         * @param message Bindings message or plain object to encode
         * @param [writer] Writer to encode to
         * @returns Writer
         */
        public static encode(
            message: VectorGraph.IBindings,
            writer?: $protobuf.Writer
        ): $protobuf.Writer;

        /**
         * Decodes a Bindings message from the specified reader or buffer.
         * @param reader Reader or buffer to decode from
         * @param [length] Message length if known beforehand
         * @returns Bindings
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        public static decode(
            reader: $protobuf.Reader | Uint8Array,
            length?: number
        ): VectorGraph.Bindings;
    }
}
