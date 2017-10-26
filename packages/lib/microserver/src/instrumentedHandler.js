const { tracer } = require('@graphistry/instrumentation');
const { Annotation, HttpHeaders: Header, option: { Some, None }, TraceId } = require('zipkin');
const url = require('url');

/*
    This entire module is basically just a tweaked version of zipkin-instrumentation-express's core logic.
*/

const port = process.env.PORT;

const extractHeader = (req, header) => req.headers[header];

function containsRequiredHeaders(req) {
    return (
        extractHeader(req, Header.TraceId) !== undefined &&
        extractHeader(req, Header.SpanId) !== undefined
    );
}

function stringToBoolean(str) {
    return str === '1';
}

function stringToIntOption(str) {
    try {
        return new Some(parseInt(str));
    } catch (err) {
        return None;
    }
}

function formatRequestUrl(req) {
    const parsed = url.parse(req.url);
    return url.format({
        protocol: req.protocol,
        host: extractHeader(req, 'host'),
        pathname: parsed.pathname,
        search: parsed.search
    });
}

module.exports = serviceName => fn => async (req, res) => {
    tracer.scoped(() => {
        const readHeader = header => {
            const val = extractHeader(req, header);
            if (val != null) {
                return new Some(val);
            } else {
                return None;
            }
        };

        if (containsRequiredHeaders(req)) {
            const spanId = readHeader(Header.SpanId);
            spanId.ifPresent(sid => {
                const traceId = readHeader(Header.TraceId);
                const parentSpanId = readHeader(Header.ParentSpanId);
                const sampled = readHeader(Header.Sampled);
                const flags = readHeader(Header.Flags)
                    .flatMap(stringToIntOption)
                    .getOrElse(0);
                const id = new TraceId({
                    traceId,
                    parentId: parentSpanId,
                    spanId: sid,
                    sampled: sampled.map(stringToBoolean),
                    flags
                });
                tracer.setId(id);
            });
        } else {
            tracer.setId(tracer.createRootId());
            if (extractHeader(req, Header.Flags)) {
                const currentId = tracer.id;
                const idWithFlags = new TraceId({
                    traceId: currentId.traceId,
                    parentId: currentId.parentId,
                    spanId: currentId.spanId,
                    sampled: currentId.sampled,
                    flags: readHeader(Header.Flags)
                });
                tracer.setId(idWithFlags);
            }
        }

        const id = tracer.id;

        tracer.recordServiceName(serviceName);
        tracer.recordRpc(req.method.toUpperCase());
        tracer.recordBinary('http.url', formatRequestUrl(req));
        tracer.recordAnnotation(new Annotation.ServerRecv());
        tracer.recordAnnotation(new Annotation.LocalAddr({ port }));

        if (id.flags !== 0 && id.flags != null) {
            tracer.recordBinary(Header.Flags, id.flags.toString());
        }

        res.on('finish', () => {
            tracer.scoped(() => {
                tracer.setId(id);
                tracer.recordBinary('http.status_code', res.statusCode.toString());
                tracer.recordAnnotation(new Annotation.ServerSend());
            });
        });

        fn(req, res);
    });
};
