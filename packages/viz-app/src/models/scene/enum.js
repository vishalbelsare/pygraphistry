/* datasource can be either SERVER or CLIENT */

export const VBODataSources = {
    HOST: 'HOST', // Plain server buffer
    DEVICE: 'DEVICE', // OpenCL server buffer
    CLIENT: 'CLIENT' // Client-computed buffer
};

export const textureDataSources = {
    CLIENT: 'CLIENT', // Texture written by client
    SEREVER: 'SERVER' // Texture downloaded from server
};

export const DrawOptions = {
    DYNAMIC_DRAW: 'DYNAMIC_DRAW',
    STREAM_DRAW: 'STREAM_DRAW',
    STATIC_DRAW: 'STATIC_DRAW'
};

export const STROKE_WIDTH = 4.0;
