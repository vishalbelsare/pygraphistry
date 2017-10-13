import { Observable } from 'rxjs';

// Site-level configuration:
export const BUCKET_REGION = 'us-west-1';
export const BUCKET_NAME = 'graphistry.data';
export const BUCKET_URL = `https://s3-${BUCKET_REGION}.amazonaws.com/${BUCKET_NAME}`;
export const BASE_URL = `${BUCKET_URL}/Static/`;

export function loadResource(resource, options) {
    const { contentKey = '', responseType = 'json', method = 'GET', headers = {} } = options;

    return Observable.ajax({
        method,
        headers,
        responseType,
        url: `${BASE_URL}${contentKey}/${resource}`
    });
}
