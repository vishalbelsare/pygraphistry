import { container } from '@graphistry/falcor-react-redux';

export const sessionContainer = container({
    renderLoading: true,
    fragment: () => `{
        status, message, progress
    }`
});
