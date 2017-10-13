import { container } from '@graphistry/falcor-react-redux';

export default container({
  renderLoading: false,
  fragment: ({ pivotParameterKeys = [] } = {}) => {
    if (pivotParameterKeys.length === 0) {
      return `{ id, name, tags, pivotParameterKeys }`;
    }
    return `{
            id, name, tags,
            pivotParameterKeys,
            pivotParametersUI: {
                ${pivotParameterKeys}
            }
        }`;
  }
});
