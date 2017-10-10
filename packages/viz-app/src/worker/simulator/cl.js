'use strict';

var Q = require('q');
var _ = require('underscore');
var nodeutil = require('util');
var path = require('path');
var util = require('./util.js');

var log = require('@graphistry/common').logger;
var logger = log.createLogger('graph-viz', 'graph-viz/js/cl.js');

var perf = require('@graphistry/common').perfStats.createPerfMonitor();

logger.trace('Initializing node-webcl flavored cl.js');
//var webcl = require('node-webcl');
import _config from '@graphistry/config';
const config = _config();
var ocl = require('node-opencl');
// Q.longStackSupport = true;

// TODO: remove types from SimCL, since they are no longer needed
var types = {
  char_t: 'char',
  double_t: 'double',
  float_t: 'float',
  half_t: 'half',
  int_t: 'int',
  local_t: '__local',
  long_t: 'long',
  short_t: 'short',
  uchar_t: 'uchar',
  uint_t: 'uint',
  ulong_t: 'ulong',
  ushort_t: 'ushort',
  float2_t: 'float2',
  float3_t: 'float3',
  float4_t: 'float4',
  float8_t: 'float8',
  float16_t: 'float16',
  define: '#define'
};

var defaultVendor = 'nvidia';

var clDeviceType = {
  cpu: ocl.DEVICE_TYPE_CPU,
  gpu: ocl.DEVICE_TYPE_GPU,
  all: ocl.DEVICE_TYPE_ALL,
  any: ocl.DEVICE_TYPE_ALL,
  default: ocl.DEVICE_TYPE_ALL
};

var clMemFlags = {
  mem_read_write: ocl.MEM_READ_WRITE,
  mem_read_only: ocl.MEM_READ_ONLY,
  mem_write_only: ocl.MEM_WRITE_ONLY,
  mem_use_host_ptr: ocl.MEM_USE_HOST_PTR,
  mem_alloc_host_ptr: ocl.MEM_ALLOC_HOST_PTR,
  mem_copy_host_ptr: ocl.MEM_COPY_HOST_PTR,
  mem_host_write_only: ocl.MEM_HOST_WRITE_ONLY,
  mem_host_read_only: ocl.MEM_HOST_READ_ONLY,
  mem_host_no_access: ocl.MEM_HOST_NO_ACCESS
};

function createSync(renderer, device = 'all', vendor = 'default') {
  var clDevice = clDeviceType[device.toLowerCase()];
  if (!clDevice) {
    logger.warn('Unknown device %s, using "all"', device);
    clDevice = clDeviceType.all;
  }
  return createCLContextNode(renderer, clDevice, vendor.toLowerCase());
}

// TODO: in call() and setargs(), we currently requires a `argTypes` argument becuase older WebCL
// versions require us to pass in the type of kernel args. However, current versions do not. We want
// to keep this API as close to the current WebCL spec as possible. Therefore, we should not require
// that argument, even on old versions. Instead, we should query the kernel for the types of each
// argument and fill in that information automatically, when required by old WebCL versions.

var create = Q.promised(createSync);

function createCLContextNode(renderer, DEVICE_TYPE, vendor) {
  if (ocl === undefined) {
    throw new Error('No OpenCL found.');
  }
  if (ocl === null) {
    throw new Error("Can't access OpenCL object");
  }

  var platforms = ocl.getPlatformIDs();
  if (platforms.length === 0) {
    throw new Error("Can't find any OpenCL platforms");
  }
  logger.debug('Found %d OpenCL platforms; using first', platforms.length);
  var platform = platforms[0];

  var clDevices = ocl.getDeviceIDs(platform, DEVICE_TYPE);

  logger.debug('Devices found on platform: %d', clDevices.length);
  if (clDevices.length < 1) {
    throw new Error('No OpenCL devices of specified type (' + DEVICE_TYPE + ') found');
  }

  function getDevicesNamesAndPlatforms() {
    var devices = [];
    var devicesDisplayName = [];
    var platforms = [];

    ocl
      .getPlatformIDs()
      .reverse()
      .forEach(function(p) {
        var pDevices = ocl.getDeviceIDs(p).reverse();
        var info = ocl.getPlatformInfo(p, ocl.PLATFORM_VERSION);
        devicesDisplayName = devicesDisplayName.concat(
          pDevices.map(function(d) {
            return info + ' : ' + ocl.getDeviceInfo(d, ocl.DEVICE_NAME);
          })
        );
        devices = devices.concat(pDevices);
        platforms = platforms.concat(
          pDevices.map(function() {
            return p;
          })
        );
      });
    return { devices, devicesDisplayName, platforms };
  }

  var { devices, devicesDisplayName } = getDevicesNamesAndPlatforms();
  logger.debug({ devices: devicesDisplayName }, 'Test');

  devices = devices.map(function(d) {
    var typeToString = function(v) {
      return v === ocl.DEVICE_TYPE_CPU
        ? 'CPU'
        : v === ocl.DEVICE_TYPE_GPU
          ? 'GPU'
          : v === ocl.DEVICE_TYPE_ACCELERATOR
            ? 'ACCELERATOR'
            : v === ocl.DEVICE_TYPE_DEFAULT ? 'DEFAULT' : 'unknown type: ' + v;
    };

    // TODO: this is definitely not the number of compute units
    var computeUnits = ocl.getDeviceInfo(d, ocl.DEVICE_MAX_WORK_ITEM_SIZES).reduce(function(a, b) {
      return a * b;
    });

    return {
      device: d,
      deviceType: typeToString(ocl.getDeviceInfo(d, ocl.DEVICE_TYPE)),
      computeUnits: computeUnits,
      name: ocl.getDeviceInfo(d, ocl.DEVICE_NAME)
    };
  });

  if (vendor === 'default') {
    vendor = defaultVendor;
  }

  // Try device specified in config first
  const { GPU_OPTIONS: { device: desiredDevice } = {} } = config;
  if (desiredDevice) {
    devices.sort((a, b) => {
      if (a.name.indexOf(desiredDevice) !== -1) {
        return -1;
      } else if (b.name.indexOf(desiredDevice) !== -1) {
        return 1;
      } else {
        return 0;
      }
    });
  }

  var deviceWrapper = null,
    err = null;
  var i;
  var wrapped;
  var clErrorHandler = function() {
    // TODO
  };
  for (i = 0; i < devices.length && deviceWrapper === null; i++) {
    wrapped = devices[i];

    try {
      wrapped.context = ocl.createContext(
        [ocl.CONTEXT_PLATFORM, platform],
        [wrapped.device],
        clErrorHandler,
        clErrorHandler
      );

      if (wrapped.context === null) {
        throw new Error('Error creating WebCL context');
      }

      if (ocl.VERSION_2_0) {
        wrapped.queue = ocl.createCommandQueueWithProperties(wrapped.context, wrapped.device, []);
      } else {
        wrapped.queue = ocl.createCommandQueue(wrapped.context, wrapped.device, 0);
      }
      deviceWrapper = wrapped;
    } catch (e) {
      logger.trace('Skipping device %d due to error %o. %o', i, e, wrapped);
      err = e;
    }
  }

  if (deviceWrapper === null) {
    throw err !== null ? err : new Error('A context could not be created from an available device');
  }

  var attribs = [
    'NAME',
    'VENDOR',
    'VERSION',
    'PROFILE',
    'PLATFORM',
    'MAX_WORK_GROUP_SIZE',
    'MAX_WORK_ITEM_SIZES',
    'MAX_MEM_ALLOC_SIZE',
    'GLOBAL_MEM_SIZE',
    'LOCAL_MEM_SIZE',
    'MAX_CONSTANT_BUFFER_SIZE',
    'MAX_CONSTANT_BUFFER_SIZE',
    'PROFILE',
    'PROFILING_TIMER_RESOLUTION'
  ];

  var props = _.object(
    attribs.map(function(name) {
      return [name, ocl.getDeviceInfo(deviceWrapper.device, ocl['DEVICE_' + name])];
    })
  );
  props.TYPE = deviceWrapper.deviceType;

  logger.info('OpenCL    Type:%s  Vendor:%s  Device:%s', props.TYPE, props.VENDOR, props.NAME);

  // extract supported OpenCL version
  props.MAX_CL_VERSION = props.VERSION.substring(7, 10);

  logger.trace(
    'Device Sizes   WorkGroup:%d  WorkItem:%s',
    props.MAX_WORK_GROUP_SIZE,
    props.MAX_WORK_ITEM_SIZES
  );
  logger.trace(
    'Max Mem (kB)   Global:%d  Alloc:%d  Local:%d  Constant:%d',
    props.GLOBAL_MEM_SIZE / 1024,
    props.MAX_MEM_ALLOC_SIZE / 1024,
    props.LOCAL_MEM_SIZE / 1024,
    props.MAX_CONSTANT_BUFFER_SIZE / 1024
  );
  logger.trace(
    'Profile (ns)   Type:%s  Resolution:%d',
    props.PROFILE,
    props.PROFILING_TIMER_RESOLUTION
  );

  var res = {
    renderer: renderer,
    cl: ocl,
    context: deviceWrapper.context,
    device: deviceWrapper.device,
    queue: deviceWrapper.queue,
    deviceProps: props,
    maxThreads: ocl.getDeviceInfo(deviceWrapper.device, ocl.DEVICE_MAX_WORK_GROUP_SIZE),
    numCores: ocl.getDeviceInfo(deviceWrapper.device, ocl.DEVICE_MAX_COMPUTE_UNITS)
  };

  //FIXME ??
  res.compile = compile.bind(this, res);
  res.createBuffer = createBuffer.bind(this, res);
  res.createBufferGL = createBufferGL.bind(this, res);
  res.finish = finish;

  return res;
}

/**
 * Compile the WebCL program source and return the kernel(s) requested
 *
 * @param cl - the cljs instance object
 * @param {string} source - the source code of the WebCL program you wish to compile
 * @param {(string|string[])} kernels - the kernel name(s) you wish to get from the compiled program
 *
 * @returns {(kernel|Object.<string, kernel>)} If kernels was a single kernel name, returns a
 *          single kernel. If kernels was an array of kernel names, returns an object with each
 *          kernel name mapped to its kernel object.
 */
var compile = Q.promised(function(cl, source, kernels) {
  perf.startTiming('graph-viz:cl:compilekernel');

  logger.trace('Kernel: ', kernels[0]);
  logger.trace('Compiling kernels');

  var program;
  try {
    // compile and link program
    program = ocl.createProgramWithSource(cl.context, source);
    // Note: Include dir is not official webcl, won't work in the browser.
    // var includeDir = path.resolve(__dirname, '..', 'kernels');
    var includeDir = path.resolve('./kernels');
    var clver = '';
    // use OpenCL 2.0 if available
    if (parseFloat(cl.deviceProps.MAX_CL_VERSION) >= 2.0 && ocl.VERSION_2_0) {
      clver = ' -cl-std=CL2.0';
    }
    ocl.buildProgram(program, [cl.device], '-I ' + includeDir + ' -cl-fast-relaxed-math ' + clver);

    // create kernels
    try {
      var kernelsObjs = typeof kernels === 'string' ? ['unknown'] : kernels;
      var compiled = _.object(
        kernelsObjs.map(function(kernelName) {
          logger.trace('    Compiling', kernelName);
          return [kernelName, ocl.createKernel(program, kernelName)];
        })
      );
      logger.trace('    Compiled kernels');

      return typeof kernels === 'string' ? compiled.unknown : compiled;
    } catch (e) {
      log.makeQErrorHandler(logger, 'Kernel creation error:')(e);
    }
  } catch (e) {
    try {
      if (program === undefined) {
        log.makeQErrorHandler(logger, 'OpenCL compilation error')(e);
      } else {
        var buildLog = ocl.getProgramBuildInfo(program, cl.device, ocl.PROGRAM_BUILD_LOG);
        log.makeQErrorHandler(logger, 'OpenCL compilation error (with log)')(buildLog);
      }
    } catch (e2) {
      log.makeQErrorHandler(logger, 'OpenCL compilation failed, no build log possible')(e2);
    }
  }
});

var acquire = function(buffers) {
  return Q.all(
    (buffers || []).map(function(buffer) {
      return buffer.acquire();
    })
  );
};

var release = function(buffers) {
  return Q.all(
    (buffers || []).map(function(buffer) {
      return buffer.release();
    })
  );
};

// Executes the specified kernel, with `threads` number of threads, acquiring/releasing any needed resources
var call = Q.promised(function(kernel, globalSize, buffers, localSize) {
  return (acquire(buffers)
      .then(function() {
        var workgroup;
        if (localSize === undefined || localSize === null) {
          workgroup = null;
        } else {
          workgroup = [localSize];
        }
        var global = [globalSize];
        // TODO: passing `null` might a problem with node-opencl
        ocl.enqueueNDRangeKernel(kernel.cl.queue, kernel.kernel, null, global, workgroup);
      })
      .fail(log.makeQErrorHandler(logger, 'Kernel error'))
      // TODO: need GL buffer interoperability?
      //.then(release.bind('', buffers)) // Release of GL buffers
      .then(function() {
        // wait for kernel to finish
        // TODO: isn't this also called somewhere else?
        ocl.finish(kernel.cl.queue);
      })
      .then(_.constant(kernel)) );
});

var finish = function(queue) {
  ocl.finish(queue);
};

var createBuffer = Q.promised(function(cl, size, name, flags) {
  logger.debug('Creating buffer %s, size %d', name, size);

  var memFlags;
  if (!flags) {
    memFlags = ocl.MEM_READ_WRITE;
  } else {
    const map = flags.map(flag => clMemFlags[flag]);
    memFlags = map.reduce((a, b) => a | b, 0);
    logger.debug({ memFlags, map }, 'Flags set');
  }

  var buffer = ocl.createBuffer(cl.context, memFlags, size);

  if (buffer === null) {
    throw new Error('Could not create the OpenCL buffer');
  }

  var bufObj = {
    name: name,
    buffer: buffer,
    cl: cl,
    size: size,
    // FIXME: acquire and release could be removed after GL dependencies are
    //        scraped
    acquire: function() {
      return Q();
    },
    release: function() {
      return Q();
    }
  };
  bufObj.delete = Q.promised(function() {
    //buffer.release();
    ocl.ReleaseMemObject(buffer);
    bufObj.size = 0;
    return null;
  });
  bufObj.write = write.bind(this, bufObj);
  bufObj.read = read.bind(this, bufObj);
  bufObj.copyInto = copyBuffer.bind(this, cl, bufObj);
  return bufObj;
});

// TODO: If we call buffer.acquire() twice without calling buffer.release(), it should have no
// effect.
function createBufferGL(cl, vbo, name) {
  logger.debug('Creating buffer %s from GL buffer', name);

  if (vbo.gl === null) {
    logger.debug('GL not enabled; falling back to creating CL buffer');
    return createBuffer(cl, vbo.len, name)
      .then(function(bufObj) {
        if (vbo.data !== null) {
          return bufObj.write(vbo.data);
        } else {
          return bufObj;
        }
      })
      .then(function(bufObj) {
        // Delete reference to data once we've written it, so we don't leak memory
        bufObj.data = null;
        return bufObj;
      });
  }

  throw new Error('shared GL/CL buffers not supported by node-opencl');

  // var deferred = Q.defer();

  // var buffer = cl.context.createFromGLBuffer(cl.cl.MEM_READ_WRITE, vbo.buffer);

  // if (buffer === null) {
  //     deferred.reject(new Error("Could not create WebCL buffer from WebGL buffer"))
  // } else {
  //     if (!buffer.getInfo) { logger.debug("WARNING: no getInfo() available on buffer %s", name); }

  //     var bufObj = {
  //         "name": name,
  //         "buffer": buffer,
  //         "cl": cl,
  //         "size": buffer.getInfo ? buffer.getInfo(cl.cl.MEM_SIZE) : vbo.len,
  //         "acquire": Q.promised(function() {
  //             cl.renderer.finish();
  //             cl.queue.enqueueAcquireGLObjects([buffer]);

  //         }),
  //         "release": Q.promised(function() {
  //             cl.queue.enqueueReleaseGLObjects([buffer]);
  //             cl.queue.finish();
  //             cl.renderer.finish();
  //         })
  //     };

  //     bufObj.delete = Q.promised(function() {
  //         return bufObj.release()
  //         .then(function() {
  //             bufObj.release();
  //             bufObj.size = 0;
  //             return null;
  //         });
  //     });

  //     bufObj.write = write.bind(this, bufObj);
  //     bufObj.read = read.bind(this, bufObj);
  //     bufObj.copyInto = copyBuffer.bind(this, cl, bufObj);

  //     logger.trace("Created buffer");
  //     deferred.resolve(bufObj)
  // }

  // return deferred.promise;
}

var copyBuffer = Q.promised(function(cl, source, destination) {
  logger.trace(
    'Copying buffer. Source: %s (%d bytes), destination %s (%d bytes)',
    source.name,
    source.size,
    destination.name,
    destination.size
  );
  return (acquire([source, destination])
      .then(function() {
        ocl.enqueueCopyBuffer(
          cl.queue,
          source.buffer,
          destination.buffer,
          0,
          0,
          Math.min(source.size, destination.size)
        );
      })
      // .then(function () {
      //     cl.queue.finish();
      // })
      .then(release.bind(null, [source, destination])) );
});

var write = Q.promised(function write(buffer, data) {
  logger.trace('Writing to buffer', buffer.name, buffer.size, 'bytes');

  // Attempting to write data of size 0 seems to crash intel GPU drivers, so return.
  if (data.byteLength === 0) {
    return Q(buffer);
  }

  // TODO acquire not needed if GL is dropped
  return buffer
    .acquire()
    .then(function() {
      logger.trace('Writing Buffer', buffer.name, ' with byteLength: ', data.byteLength);
      ocl.enqueueWriteBuffer(buffer.cl.queue, buffer.buffer, true, 0, data.byteLength, data);
      return buffer.release();
    })
    .then(function() {
      // buffer.cl.queue.finish();
      logger.trace('Finished buffer %s write', buffer.name);

      return buffer;
    });
});

var read = Q.promised(function(buffer, target, optStartIdx, optLen) {
  logger.trace('Reading from buffer', buffer.name);
  var start = Math.min(optStartIdx || 0, buffer.size);
  var len = optLen !== undefined ? optLen : buffer.size - start;

  if (len === 0) {
    return Q(buffer);
  }

  return buffer
    .acquire()
    .then(function() {
      logger.trace('Reading Buffer', buffer.name, start, len);
      ocl.enqueueReadBuffer(buffer.cl.queue, buffer.buffer, true, start, len, target);
      // TODO acquire and release not needed if GL is dropped
      return buffer.release();
    })
    .then(function() {
      logger.trace('Done Reading: ', buffer.name);
      return buffer;
    })
    .fail(log.makeQErrorHandler(logger, 'Read error for buffer', buffer.name));
});

export {
  acquire,
  call,
  compile,
  create,
  createSync,
  createBuffer,
  createBufferGL,
  release,
  types,
  write,
  read
};
